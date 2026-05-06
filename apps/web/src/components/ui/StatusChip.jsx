const map = {
  confirmed: { bg:'var(--mint-dim)', color:'var(--mint)' },
  pending:   { bg:'var(--amber-dim)', color:'var(--amber)' },
  cancelled: { bg:'var(--rose-dim)', color:'var(--rose)' },
  completed: { bg:'var(--blue-dim)', color:'var(--blue)' },
};

export default function StatusChip({ status }) {
  const s = map[status] || map.pending;
  return (
    <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, fontFamily:'var(--font-mono)', background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {status}
    </span>
  );
}
