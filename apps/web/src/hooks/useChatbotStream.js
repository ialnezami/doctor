import { useCallback, useRef, useState } from 'react';
import { streamMessage, resetSession } from '../api/chatbot';

/**
 * useChatbotStream — React hook for the AI patient chatbot.
 *
 * API surface mirrors the mobile hook exactly so shared logic is portable.
 *
 * State:
 *   messages  — array of { id, role: 'user'|'assistant', content: string }
 *   streaming — boolean: true while receiving tokens
 *   urgency   — string | null: 'routine'|'soon'|'urgent'|'emergency'
 *   emergency — boolean: true triggers 911 CTA, suppresses doctor cards
 *   doctors   — array of doctor objects from the 'done' SSE event
 *   error     — string | null: last error message shown to user
 *
 * Methods:
 *   send(text)  — send a user message and stream the response
 *   reset()     — clear local state + call DELETE /api/chatbot/session
 */
export function useChatbotStream({ lat, lng } = {}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [urgency, setUrgency] = useState(null);
  const [emergency, setEmergency] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [triageSummary, setTriageSummary] = useState(null);
  const [error, setError] = useState(null);

  // AbortController ref — cancel in-flight stream on reset or unmount
  const abortRef = useRef(null);
  // Rolling id for messages
  const idRef = useRef(0);

  const nextId = () => String(++idRef.current);

  const send = useCallback(
    async (text) => {
      if (!text || !text.trim() || streaming) return;

      // Cancel any prior in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Append user message
      const userMsg = { id: nextId(), role: 'user', content: text.trim() };
      // Placeholder for streaming assistant response
      const assistantId = nextId();
      const assistantMsg = { id: assistantId, role: 'assistant', content: '' };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);
      setError(null);

      try {
        for await (const event of streamMessage({
          message: text.trim(),
          lat,
          lng,
          signal: controller.signal,
        })) {
          if (event.type === 'delta') {
            // Append token to the in-progress assistant message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.text } : m
              )
            );
          } else if (event.type === 'done') {
            if (event.urgency) setUrgency(event.urgency);
            setEmergency(Boolean(event.emergency));
            if (Array.isArray(event.doctors)) setDoctors(event.doctors);
            setTriageSummary(event.chiefComplaint || null);
          } else if (event.type === 'error') {
            setError(event.message || 'An error occurred');
          }
          // 'terminated' — stream closed cleanly, loop will exit
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // User-initiated cancel — not an error
          return;
        }
        // Surface network/parse errors to the user without exposing internals
        setError('Failed to reach the assistant. Please try again.');
        // Remove the empty placeholder on hard failure
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, lat, lng]
  );

  const reset = useCallback(async () => {
    // Cancel any in-flight stream
    abortRef.current?.abort();

    // Reset local state
    setMessages([]);
    setStreaming(false);
    setUrgency(null);
    setEmergency(false);
    setDoctors([]);
    setTriageSummary(null);
    setError(null);

    // Reset server-side session — fire-and-forget; failure is non-critical
    resetSession().catch(() => {
      // Server session cleanup failed — local state already cleared
    });
  }, []);

  return { messages, streaming, urgency, emergency, doctors, triageSummary, error, send, reset };
}

export default useChatbotStream;
