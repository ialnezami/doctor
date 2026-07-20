import client from './client';
export const getPatientMe = () => client.get('/patients/me');
export const updatePatientProfile = (data) => client.patch('/patients/me/profile', data);
export const getPatientByUserId = (userId) => client.get(`/patients/by-user/${userId}`);
export const updatePatientByUserId = (userId, data) => client.patch(`/patients/by-user/${userId}`, data);
