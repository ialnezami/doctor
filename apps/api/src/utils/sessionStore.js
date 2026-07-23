'use strict';

const NodeCache = require('node-cache');

const MAX_TURNS = 20;    // max messages in history (each turn = 2 messages)
const TTL_SECONDS = 1800; // 30-min sliding window

// useClones: false — we manage deep copies explicitly via snapshotHistory.
// checkperiod: 300 — background eviction every 5 min prevents memory growth.
const cache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 300, useClones: false });

const PENDING_BOOKING_TTL = 600; // 10-minute confirmation window

const pendingBookingCache = new NodeCache({
  stdTTL: PENDING_BOOKING_TTL,
  checkperiod: 60,
  useClones: false,
});

/**
 * Returns the conversation history for a user.
 * Returns [] for unknown users.
 * @param {string} userId
 * @returns {Array<{role: string, content: string}>}
 */
function getHistory(userId) {
  return cache.get(userId) || [];
}

/**
 * Returns a deep copy of the conversation history.
 * Mutations to the returned snapshot do NOT affect the stored history.
 * Use this before streaming to protect against session-reset race conditions.
 * @param {string} userId
 * @returns {Array<{role: string, content: string}>}
 */
function snapshotHistory(userId) {
  return JSON.parse(JSON.stringify(cache.get(userId) || []));
}

/**
 * Appends a user+assistant pair to history and persists (resetting TTL).
 * Trims oldest messages if history exceeds MAX_TURNS.
 * @param {string} userId
 * @param {string} userMessage   - raw user message (NOT logged elsewhere)
 * @param {string} assistantMessage - raw assistant response (NOT logged)
 */
function appendAndSave(userId, userMessage, assistantMessage) {
  let history = cache.get(userId) || [];
  history = [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage },
  ];
  // Trim to MAX_TURNS keeping the most recent messages
  if (history.length > MAX_TURNS) {
    history = history.slice(history.length - MAX_TURNS);
  }
  // cache.set with TTL resets the sliding window
  cache.set(userId, history);
}

/**
 * Clears the session history for a user.
 * @param {string} userId
 */
function clearSession(userId) {
  cache.del(userId);
}

function setPendingBooking(userId, data) {
  pendingBookingCache.set(userId, data);
}

function getPendingBooking(userId) {
  return pendingBookingCache.get(userId) ?? null;
}

function clearPendingBooking(userId) {
  pendingBookingCache.del(userId);
}

module.exports = {
  getHistory,
  snapshotHistory,
  appendAndSave,
  clearSession,
  setPendingBooking,
  getPendingBooking,
  clearPendingBooking,
  MAX_TURNS,
  TTL_SECONDS,
};
