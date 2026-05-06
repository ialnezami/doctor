import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', height:'100vh' }}>
      <Sidebar />
      <main style={{ overflowY:'auto', background:'var(--bg)' }}>{children}</main>
    </div>
  );
}
