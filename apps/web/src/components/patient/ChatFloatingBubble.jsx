/**
 * ChatFloatingBubble — fixed bottom-center toggle button for the AI chat widget.
 *
 * Always rendered at the layout level (PatientLayout), not per-page.
 * zIndex 9999 ensures it floats above all page content and the AppLayout sidebar.
 *
 * Props:
 *   onClick  — () => void — toggle chat open/closed
 *   isOpen   — boolean — controls aria-label and visual state
 */
export default function ChatFloatingBubble({ onClick, isOpen }) {
  const bubbleStyle = {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.03em',
    boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    fontFamily: 'inherit',
  };

  return (
    <button
      style={bubbleStyle}
      onClick={onClick}
      aria-label={isOpen ? 'Close AI chat' : 'Open AI chat assistant'}
      title={isOpen ? 'Close AI chat' : 'Open AI chat assistant'}
    >
      {isOpen ? '✕' : 'AI'}
    </button>
  );
}
