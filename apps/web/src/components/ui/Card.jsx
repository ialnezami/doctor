export default function Card({ children, style }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:18, ...style }}>
      {children}
    </div>
  );
}
