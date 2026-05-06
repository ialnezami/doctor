import client from './client';
export const login = (d) => client.post('/auth/login', d);
export const register = (d) => client.post('/auth/register', d);
