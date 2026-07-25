import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * ChatMessage — renders a single chat bubble.
 *
 * User messages: plain text, right-aligned, blue bg.
 * Assistant messages: markdown-rendered via react-markdown + remark-gfm, left-aligned.
 * react-markdown sanitizes output by default — no dangerouslySetInnerHTML, no rehype-raw.
 *
 * Props:
 *   role    — 'user' | 'assistant'
 *   content — string (may be partial during streaming)
 */
export default function ChatMessage({ role, content }) {
  const isUser = role === 'user';

  const wrapperStyle = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '85%',
    margin: '6px 12px',
    padding: '10px 14px',
    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    backgroundColor: isUser ? 'var(--mint, #0fe3b0)' : 'var(--bg3, #111f35)',
    color: isUser ? '#060d18' : 'var(--text, #e2e8f0)',
    border: isUser ? 'none' : '1px solid var(--border, #1e3a5f)',
    fontSize: 14,
    lineHeight: 1.6,
    wordBreak: 'break-word',
    boxShadow: isUser ? '0 1px 4px rgba(15,227,176,0.18)' : 'none',
  };

  return (
    <div style={wrapperStyle}>
      {isUser ? (
        <div>{content}</div>
      ) : content ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        // Empty assistant placeholder — shown while first token is loading
        <div style={{ opacity: 0.5, fontStyle: 'italic' }}>...</div>
      )}
    </div>
  );
}
