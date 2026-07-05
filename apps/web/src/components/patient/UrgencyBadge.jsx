/**
 * UrgencyBadge — colored urgency chip shown after triage parses.
 *
 * Color scheme mirrors mobile for visual consistency:
 *   routine   → green
 *   soon      → blue
 *   urgent    → orange
 *   emergency → red
 *
 * Returns null for unknown/missing urgency values — safe to render unconditionally.
 */
const URGENCY_COLORS = {
  routine: '#16a34a',
  soon: '#2563eb',
  urgent: '#ea580c',
  emergency: '#dc2626',
};

const URGENCY_LABELS = {
  routine: 'Routine',
  soon: 'Soon',
  urgent: 'Urgent',
  emergency: '! Emergency',
};

export default function UrgencyBadge({ urgency }) {
  if (!urgency || !URGENCY_COLORS[urgency]) return null;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 12,
        backgroundColor: URGENCY_COLORS[urgency],
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
      role="status"
      aria-label={`Triage urgency: ${urgency}`}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
