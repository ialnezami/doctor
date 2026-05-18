import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { googleSignIn } from '../api/auth';

export default function GoogleSignInButton() {
  const ref = useRef(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.login);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = () => {
      if (!window.google || !ref.current) return;

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setError('');
          try {
            const { token, user } = await googleSignIn(credential);
            setAuth(user, token);
            navigate('/find-doctor');
          } catch (e) {
            setError(e.message || 'Google sign-in failed');
          }
        },
      });

      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: ref.current.offsetWidth || 360,
      });
    };

    if (window.google) {
      init();
    } else {
      // GSI script is async — wait for it to load
      const script = document.querySelector('script[src*="accounts.google.com/gsi"]');
      if (script) {
        script.addEventListener('load', init);
        return () => script.removeEventListener('load', init);
      }
    }
  }, []);

  return (
    <div>
      <div ref={ref} style={{ width: '100%' }} />
      {error && (
        <p style={{ color: 'var(--rose)', fontSize: 13, margin: '8px 0 0', textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}
