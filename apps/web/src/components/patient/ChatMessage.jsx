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
    borderRadius: 12,
    backgroundColor: isUser ? '#2563eb' : '#f3f4f6',
    color: isUser ? '#fff' : '#111827',
    fontSize: 14,
    lineHeight: 1.5,
    wordBreak: 'break-word',
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
