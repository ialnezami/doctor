'use strict';

// sessionStore.js is not implemented yet — these tests will fail (RED state)
// Once implemented, they validate the in-memory node-cache TTL session store.

const path = require('path');

describe('sessionStore', () => {
  let getHistory, appendAndSave, clearSession, snapshotHistory, MAX_TURNS;

  beforeEach(() => {
    // Reset module between tests so cache state is clean
    jest.resetModules();
    const store = require('../sessionStore');
    getHistory    = store.getHistory;
    appendAndSave = store.appendAndSave;
    clearSession  = store.clearSession;
    snapshotHistory = store.snapshotHistory;
    MAX_TURNS     = store.MAX_TURNS;
  });

  it('returns [] for unknown user', () => {
    expect(getHistory('unknown-user-xyz')).toEqual([]);
  });

  it('appendAndSave persists user+assistant pair', () => {
    appendAndSave('u1', 'I have a headache', 'Here is general info about headaches.');
    const history = getHistory('u1');
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'I have a headache' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'Here is general info about headaches.' });
  });

  it('caps history at MAX_TURNS messages', () => {
    // Fill beyond MAX_TURNS
    for (let i = 0; i < MAX_TURNS + 2; i++) {
      appendAndSave('u2', `user-msg-${i}`, `assistant-msg-${i}`);
    }
    const history = getHistory('u2');
    expect(history.length).toBeLessThanOrEqual(MAX_TURNS);
  });

  it('clearSession removes history so next getHistory returns []', () => {
    appendAndSave('u3', 'hello', 'hi there');
    expect(getHistory('u3').length).toBeGreaterThan(0);
    clearSession('u3');
    expect(getHistory('u3')).toEqual([]);
  });

  it('snapshotHistory returns a deep copy — mutation does not affect store', () => {
    appendAndSave('u4', 'msg', 'response');
    const snapshot = snapshotHistory('u4');
    // Mutate the snapshot
    snapshot[0].content = 'MUTATED';
    // Store must be unchanged
    const fresh = getHistory('u4');
    expect(fresh[0].content).toBe('msg');
  });

  it('MAX_TURNS is exported and equals 20', () => {
    expect(MAX_TURNS).toBe(20);
  });
});
