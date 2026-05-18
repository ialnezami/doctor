import client from './client';
export const login = (data) => client.post('/auth/login', data);
export const register = (data) => client.post('/auth/register', data);
export async function googleSignIn(idToken) {
  const data = await client.post('/auth/google', { idToken });
  return data;
}
