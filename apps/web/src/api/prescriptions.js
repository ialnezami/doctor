import client from './client';
export const getPrescriptions = (params) => client.get('/prescriptions', { params });
export const createPrescription = (data) => client.post('/prescriptions', data);
export const getPrescriptionPDF = (id) => client.get(`/prescriptions/${id}/pdf`);
