import client from './client';
export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (data) => client.patch('/patients/me/profile', data);
