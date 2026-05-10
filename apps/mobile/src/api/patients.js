import client from './client';
export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (d) => client.patch('/patients/me/profile', d);
