'use strict';
import Constants from 'expo-constants';
import useAuthStore from '../store/authStore';
import client from './client';

/**
 * Resolve the API base URL.
 * Priority: EXPO_PUBLIC_API_URL env var → derive from Expo hostUri → localhost fallback.
 * Mirrors the pattern in client.js so both resolve to the same server.
 */
function getBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3001/api`;
}

/**
 * Async generator that streams SSE events from POST /api/chatbot/message.
 *
 * Uses native fetch (NOT axios) because axios does not expose response body
 * as a ReadableStream in React Native / Hermes.
 *
 * Yields parsed SSE event objects:
 *   { type: 'delta', text: string }
 *   { type: 'done', urgency, emergency, doctors, specialties, summary, specialtyFallback }
 *   { type: 'error', message: string }
 *   { type: 'terminated' }  — emitted when [DONE] sentinel received
 *
 * Security: token read at call-time (not module load) so rotation is respected.
 * No console.log of message content — threat T-09.2-01 mitigation.
 *
 * @param {{ message: string, lat?: number, lng?: number, signal?: AbortSignal }} opts
 */
export async function* streamMessage({ message, lat, lng, signal }) {
  const token = useAuthStore.getState().token;
  const apiKey = process.env.EXPO_PUBLIC_API_KEY || '';

  const res = await fetch(`${getBaseUrl()}/chatbot/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-api-key': apiKey,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ message, lat, lng }),
    signal,
  });

  if (!res.ok) {
    // Read a small slice to surface API error messages without logging user data
    const body = await res.text().catch(() => '');
    throw new Error(`chatbot ${res.status}: ${body.slice(0, 200)}`);
  }

  // Pitfall-5 guard: Hermes/RN must expose body as ReadableStream.
  // If not, surface a clear error rather than a cryptic TypeError.
  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new Error(
      'SSE streaming not supported in this runtime. Ensure Hermes is enabled and Expo SDK >= 50.'
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines (\n\n).
      // Split on double-newline, keep the last (potentially incomplete) chunk in buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        // Each frame may have multiple lines; find the data: line
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;

        const raw = dataLine.slice(6); // strip "data: "
        if (raw === '[DONE]') {
          yield { type: 'terminated' };
          return;
        }

        try {
          yield JSON.parse(raw);
        } catch {
          // Ignore malformed frames — partial JSON can arrive if the server
          // sends multiple data: lines in a single frame (rare with our backend)
        }
      }
    }
  } finally {
    // Always release the reader lock so the connection is fully closed
    reader.releaseLock();
  }
}

/**
 * Delete the server-side session so the next message starts a fresh conversation.
 * Best-effort — caller should not crash if this fails.
 */
export async function resetSession() {
  return client.delete('/chatbot/session');
}

/**
 * Fetch doctor recommendations directly (used outside the streaming flow if needed).
 * Returns the data array from the API response (client interceptor unwraps .data).
 *
 * @param {{ specialty?: string, lat?: number, lng?: number, limit?: number }} params
 */
export async function fetchDoctors({ specialty, lat, lng, limit = 5 } = {}) {
  return client.get('/chatbot/doctors', { params: { specialty, lat, lng, limit } });
}
