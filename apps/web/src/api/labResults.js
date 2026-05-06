import client from './client';

export const getLabResults = () => client.get('/lab-results');
export const getLabResult = (id) => client.get(`/lab-results/${id}`);
export const searchLabResults = (params) => client.get('/lab-results/search', { params });
export const createLabResult = (data) => client.post('/lab-results', data);
export const addLabNotes = (id, notes) => client.patch(`/lab-results/${id}/notes`, { notes });

export const createShareLink = (data) => client.post('/share', data);
export const revokeShareLink = (token) => client.delete(`/share/${token}`);
