'use strict';
import { useState, useRef, useCallback } from 'react';
import { streamMessage, resetSession as apiResetSession } from '../api/chatbot';

/**
 * useChatbotStream — manages the full state lifecycle for the AI chatbot chat UI.
 *
 * Responsibilities:
 *   - Tracks messages array (user + assistant turns)
 *   - Appends delta tokens to the in-progress assistant message as they stream in
 *   - Parses the 'done' event to extract urgency, emergency flag, and doctor recs
 *   - Exposes an AbortController so in-flight streams are cancellable on reset/unmount
 *   - Best-effort server session reset (DELETE /chatbot/session) on reset()
 *
 * Security:
 *   - No console.log of user message content (threat T-09.2-01)
 *   - AbortController mitigates runaway streams (threat T-09.2-02)
 *
 * @param {{ lat?: number, lng?: number }} opts  Patient location for geo-aware doctor recs
 * @returns {{
 *   messages: Array<{id: string, role: 'user'|'assistant', content: string}>,
 *   streaming: boolean,
 *   urgency: 'routine'|'soon'|'urgent'|'emergency'|null,
 *   emergency: boolean,
 *   doctors: Array<object>,
 *   error: string|null,
 *   send: (text: string) => Promise<void>,
 *   reset: () => Promise<void>,
 * }}
 */
export function useChatbotStream({ lat, lng } = {}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [urgency, setUrgency] = useState(null);
  const [emergency, setEmergency] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState(null);

  // Ref holds the AbortController for the current in-flight stream.
  // Using a ref (not state) avoids re-render on assignment.
  const abortRef = useRef(null);

  /**
   * Send a user message and consume the SSE stream.
   * Guards against concurrent sends (streaming flag).
   * Appends partial tokens to the assistant bubble in real-time.
   */
  const send = useCallback(
    async (userText) => {
      if (!userText?.trim() || streaming) return;

      setError(null);

      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: userText.trim(),
      };
      // Optimistically add user message + empty assistant placeholder
      const assistantId = `a-${Date.now() + 1}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamMessage({
          message: userText.trim(),
          lat,
          lng,
          signal: controller.signal,
        })) {
          switch (event.type) {
            case 'delta':
              // Append token to the active assistant message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.text ?? '') }
                    : m
                )
              );
              break;

            case 'done':
              setUrgency(event.urgency ?? null);
              setEmergency(event.emergency === true);
              setDoctors(Array.isArray(event.doctors) ? event.doctors : []);
              break;

            case 'error':
              // Server-side error embedded in the stream
              setError(event.message || 'The assistant encountered an error. Please try again.');
              break;

            case 'terminated':
              // [DONE] sentinel — stream ended cleanly
              break;

            default:
              // Unknown event types are silently ignored for forward compatibility
              break;
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Surface a user-friendly message; do NOT log err.message which may contain content
          setError(
            err.message?.startsWith('chatbot ')
              ? err.message
              : 'Could not connect to the assistant. Check your network and try again.'
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [lat, lng, streaming]
  );

  const appendLocal = useCallback((content) => {
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'assistant', content },
    ]);
  }, []);

  /**
   * Reset the conversation:
   *   1. Abort any in-flight stream
   *   2. Clear all local state
   *   3. Best-effort DELETE /chatbot/session on server
   */
  const reset = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setUrgency(null);
    setEmergency(false);
    setDoctors([]);
    setError(null);

    try {
      await apiResetSession();
    } catch {
      // Best-effort — local state is already cleared; server session expiry is acceptable fallback
    }
  }, []);

  return { messages, streaming, urgency, emergency, doctors, error, send, reset, appendLocal };
}
