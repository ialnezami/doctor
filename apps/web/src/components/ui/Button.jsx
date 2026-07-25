const styles = {
  base: { display:'inline-flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:'var(--r-sm)', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap' },
  primary: { background:'var(--mint)', color:'#000' },
  outline: { background:'transparent', color:'var(--text2)', border:'1px solid var(--border2)' },
  ghost:   { background:'var(--bg3)', color:'var(--text)', border:'1px solid var(--border)' },
  danger:  { background:'var(--rose-dim)', color:'var(--rose)', border:'1px solid rgba(244,63,94,.25)' },
};

export default function Button({ variant = 'primary', children, full, style, ...props }) {
  return (
    <button style={{ ...styles.base, ...styles[variant], ...(full ? { width:'100%', justifyContent:'center' } : {}), ...style }} {...props}>
      {children}
    </button>
  );
}
