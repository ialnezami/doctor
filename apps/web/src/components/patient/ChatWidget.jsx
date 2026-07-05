import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatbotStream } from '../../hooks/useChatbotStream';
import ChatMessage from './ChatMessage';
import UrgencyBadge from './UrgencyBadge';
import DoctorRecommendationCard from './DoctorRecommendationCard';
import ChatBookingFlow from './ChatBookingFlow';

/**
 * ChatWidget — sliding right-panel AI health assistant.
 *
 * Renders only when isOpen=true (returns null otherwise to avoid mounting cost).
 * Keyboard: Escape closes the panel.
 * Enter (without Shift) submits the message.
 * Doctor card click navigates to /doctor/:id and closes the panel.
 *
 * Props:
 *   isOpen          — boolean
 *   onClose         — () => void
 *   patientLocation — { lat: number, lng: number } | null
 *
 * Emergency handling:
 *   When emergency=true, shows a red banner with a tel:911 link.
 *   Doctor cards are suppressed — showing doctors during emergency is dangerous.
 */
export default function ChatWidget({ isOpen, onClose, patientLocation }) {
  const navigate = useNavigate();
  const lat = patientLocation?.lat ?? undefined;
  const lng = patientLocation?.lng ?? undefined;

  const { messages, streaming, urgency, emergency, doctors, error, send, reset } =
    useChatbotStream({ lat, lng });

  const [input, setInput] = useState('');
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const listRef = useRef(null);

  // Escape key closes widget
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Don't mount heavy DOM when closed
  if (!isOpen) return null;

  const onSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput('');
  };

  const onDoctorSelect = (doctorId) => {
    navigate(`/doctor/${doctorId}`);
    onClose();
  };

  const onReset = () => {
    // Explicit confirmation prevents accidental loss of conversation
    if (window.confirm('Clear conversation? This cannot be undone.')) {
      reset();
    }
  };

  const panelStyle = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 400,
    maxWidth: '100vw',
    height: '100vh',
    backgroundColor: '#ffffff',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9998,
    fontFamily: 'inherit',
  };

  return (
    <aside role="dialog" aria-modal="true" aria-label="AI Health Assistant" style={panelStyle}>
      {/* Header */}
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div>
          <strong style={{ fontSize: 15 }}>AI Health Assistant</strong>
          {urgency && (
            <div style={{ marginTop: 4 }}>
              <UrgencyBadge urgency={urgency} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onReset}
            aria-label="Reset conversation"
            style={{
              padding: '4px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#6b7280',
              fontFamily: 'inherit',
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            aria-label="Close chat"
            style={{
              padding: '4px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              background: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#6b7280',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </header>

      {/* Emergency banner — shown above conversation; suppresses doctor cards */}
      {emergency && (
        <div
          role="alert"
          style={{
            margin: '12px 16px',
            padding: '16px',
            backgroundColor: '#fee2e2',
            border: '2px solid #dc2626',
            borderRadius: 12,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              color: '#7f1d1d',
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 10,
            }}
          >
            EMERGENCY — Call emergency services now
          </div>
          <a
            href="tel:911"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              backgroundColor: '#dc2626',
              color: '#fff',
              borderRadius: 24,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Call 911
          </a>
        </div>
      )}

      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: 14,
              padding: '40px 24px',
            }}
          >
            Describe your symptoms and I will help triage your concern.
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} role={m.role} content={m.content} />
        ))}

        {/* Doctor recommendations — only shown when NOT emergency */}
        {!emergency && doctors.length > 0 && (
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 8 }}>
              Recommended doctors near you
            </div>
            {bookingDoctor && (
              <ChatBookingFlow
                doctor={bookingDoctor}
                onDone={(msg) => { setBookingDoctor(null); send(msg); }}
                onCancel={() => setBookingDoctor(null)}
              />
            )}
            {!bookingDoctor && doctors.map((d) => (
              <DoctorRecommendationCard key={d._id} doctor={d} onSelect={onDoctorSelect} onBook={setBookingDoctor} />
            ))}
          </div>
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div
          role="alert"
          style={{
            margin: '0 12px 8px',
            padding: '8px 12px',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: 8,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: '10px 12px',
          borderTop: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter inserts newline
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          placeholder="Describe your symptoms..."
          disabled={streaming}
          maxLength={2000}
          rows={2}
          aria-label="Chat input"
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            resize: 'none',
            fontSize: 14,
            fontFamily: 'inherit',
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          style={{
            padding: '10px 16px',
            backgroundColor: streaming || !input.trim() ? '#93c5fd' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          {streaming ? '...' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
