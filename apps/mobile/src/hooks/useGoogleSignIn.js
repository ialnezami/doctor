import { useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import useAuthStore from '../store/authStore';
import { googleSignIn } from '../api/auth';

WebBrowser.maybeCompleteAuthSession();

export default function useGoogleSignIn() {
  const setAuth = useAuthStore(s => s.login);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken = response.params.id_token;
      setLoading(true);
      setError('');
      googleSignIn(idToken)
        .then(({ token, user }) => setAuth(user, token))
        .catch(e => setError(e.message || 'Google sign-in failed'))
        .finally(() => setLoading(false));
    } else if (response.type === 'error' || response.type === 'cancel') {
      setError(response.type === 'cancel' ? '' : 'Google sign-in failed');
    }
  }, [response]);

  const signIn = useCallback(() => {
    setError('');
    promptAsync();
  }, [promptAsync]);

  return { signIn, loading, error, ready: !!request };
}
