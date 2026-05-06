import client from './client';

export const getLabResults = () => client.get('/lab-results');
export const getLabResult = (id) => client.get(`/lab-results/${id}`);
export const addLabNotes = (id, notes) => client.patch(`/lab-results/${id}/notes`, { notes });
export const createShareLink = (data) => client.post('/share', data);
export const revokeShareLink = (token) => client.delete(`/share/${token}`);
