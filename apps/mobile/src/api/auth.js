import client from './client';
export const login = (d) => client.post('/auth/login', d);
export const register = (d) => client.post('/auth/register', d);
export const getMe = () => client.get('/auth/me');
export const updateMe = (d) => client.patch('/auth/me', d);
export const changePassword = (d) => client.patch('/auth/change-password', d);
