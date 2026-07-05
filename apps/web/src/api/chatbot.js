import client from './client';
import useAuthStore from '../store/authStore';

function getBaseUrl() {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
}

/**
 * Async generator that streams SSE events from the chatbot endpoint.
 * Uses native fetch + ReadableStream — NOT EventSource (cannot send auth headers)
 * and NOT axios (buffers full response, cannot stream).
 *
 * Yields objects: { type: 'delta', text } | { type: 'done', urgency, emergency, doctors, ... } |
 *                 { type: 'error', message } | { type: 'terminated' }
 *
 * Caller is responsible for passing an AbortSignal to cancel on unmount.
 */
export async function* streamMessage({ message, lat, lng, signal }) {
  const token = useAuthStore.getState().token;
  const apiKey = import.meta.env.VITE_API_KEY || '';

  const res = await fetch(`${getBaseUrl()}/chatbot/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, lat, lng }),
    signal,
  });

  if (!res.ok) {
    // Read a snippet for debugging without exposing full sensitive body
    const snippet = await res.text().catch(() => '');
    throw new Error(`chatbot ${res.status}: ${snippet.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error('ReadableStream not supported in this browser');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode incrementally — `stream: true` handles multi-byte chars split across chunks
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines (\n\n)
      const frames = buffer.split('\n\n');
      // Last element may be an incomplete frame — keep in buffer
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        // Find the data line within the frame (SSE allows multi-line events)
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;

        const raw = line.slice(6); // strip "data: " prefix

        // Sentinel — stream complete
        if (raw === '[DONE]') {
          yield { type: 'terminated' };
          return;
        }

        try {
          yield JSON.parse(raw);
        } catch {
          // Skip malformed JSON — do not crash the stream
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Delete the server-side chatbot session, resetting conversation context.
 * Call this when the user explicitly resets the chat.
 */
export async function resetSession() {
  return client.delete('/chatbot/session');
}

/**
 * Fetch recommended doctors by specialty + location.
 * Used as a fallback if doctors are not embedded in the 'done' SSE event.
 */
export async function fetchDoctors({ specialty, lat, lng, limit = 5 }) {
  return client.get('/chatbot/doctors', { params: { specialty, lat, lng, limit } });
}
