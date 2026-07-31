import client from './client';

export const getStaff         = ()       => client.get('/staff');
export const inviteSecretary  = (email)  => client.post('/staff/invite', { email });
export const revokeSecretary  = (userId) => client.delete(`/staff/${userId}`);
