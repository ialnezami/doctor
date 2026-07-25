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

  // -------------------------------------------------------------------------
  // MAX_TURNS cap — adding > 20 messages must trim to exactly MAX_TURNS
  // -------------------------------------------------------------------------
  it('caps history at exactly MAX_TURNS when overflow occurs', () => {
    // MAX_TURNS = 20; each appendAndSave adds 2 messages (user + assistant).
    // Adding 11 turns = 22 messages → should be trimmed to 20.
    for (let i = 0; i < 11; i++) {
      appendAndSave('cap-user', `user-msg-${i}`, `assistant-msg-${i}`);
    }
    const history = getHistory('cap-user');
    expect(history.length).toBe(MAX_TURNS);
  });

  // -------------------------------------------------------------------------
  // snapshotHistory isolation — one user's history must not bleed into another
  // -------------------------------------------------------------------------
  it('snapshotHistory isolation — user A and user B have independent history', () => {
    appendAndSave('user-a', 'hello from A', 'hi A');
    appendAndSave('user-b', 'hello from B', 'hi B');

    const snapshotA = snapshotHistory('user-a');
    const snapshotB = snapshotHistory('user-b');

    // A and B histories are independent
    expect(snapshotA.some(m => m.content === 'hello from A')).toBe(true);
    expect(snapshotA.some(m => m.content === 'hello from B')).toBe(false);

    expect(snapshotB.some(m => m.content === 'hello from B')).toBe(true);
    expect(snapshotB.some(m => m.content === 'hello from A')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TTL sliding window — jest.useFakeTimers() to verify eviction after TTL
  // -------------------------------------------------------------------------
  it('session evicts after TTL using fake timers', () => {
    // node-cache uses real Date.now() internally; we control time via fake timers
    // to simulate TTL expiry without waiting 30 minutes.
    jest.useFakeTimers();

    // Reset module so we get a fresh NodeCache instance under fake timers
    jest.resetModules();
    const freshStore = require('../sessionStore');

    freshStore.appendAndSave('ttl-user', 'symptom message', 'ai response');
    expect(freshStore.getHistory('ttl-user')).toHaveLength(2);

    // Advance past TTL_SECONDS (1800s) + checkperiod (300s) to trigger background eviction
    jest.advanceTimersByTime((freshStore.TTL_SECONDS + 300 + 1) * 1000);

    // node-cache TTL check: after advancing time, get() returns undefined for expired keys
    const historyAfterTTL = freshStore.getHistory('ttl-user');
    expect(historyAfterTTL).toEqual([]);

    jest.useRealTimers();
  });
});
