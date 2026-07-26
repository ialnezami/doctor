import { useEffect } from 'react';
import { useAuthStore } from './store/authStore.js';
import LoginScreen from './screens/LoginScreen.jsx';
import PharmacyLayout from './screens/pharmacy/PharmacyLayout.jsx';
import DoctorLayout from './screens/doctor/DoctorLayout.jsx';
import LabLayout from './screens/lab/LabLayout.jsx';

const globalCSS = `
  :root {
    --bg:#060d18;--bg2:#0d1a2b;--bg3:#1e293b;
    --text:#e2e8f0;--text2:#94a3b8;--text3:#64748b;
    --border:#1e2d3d;--border2:#334155;
    --mint:#0fe3b0;--mint-dim:rgba(15,227,176,0.1);
    --font-display:'Inter',system-ui,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;}
  input,select,textarea,button{font-family:inherit;}
`;

export default function App() {
  const { user, token, hydrate } = useAuthStore();

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = globalCSS;
    document.head.appendChild(style);
    hydrate();
  }, []);

  if (!token || !user) return <LoginScreen />;

  return (
    <>
      {user.role === 'pharmacy'   && <PharmacyLayout />}
      {user.role === 'doctor'     && <DoctorLayout />}
      {user.role === 'laboratory' && <LabLayout />}
      {!['pharmacy','doctor','laboratory'].includes(user.role) && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
          Unsupported role: {user.role}
        </div>
      )}
    </>
  );
}
