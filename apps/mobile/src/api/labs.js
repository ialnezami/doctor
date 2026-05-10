import client from './client';
export const getLabProfile = () => client.get('/labs/me');
export const updateLabProfile = (d) => client.patch('/labs/me', d);
