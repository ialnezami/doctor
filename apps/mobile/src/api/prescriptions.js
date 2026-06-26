import client from './client';
export const getPrescriptions = () => client.get('/prescriptions');
export const getPrescriptionPDF = (id) => client.get(`/prescriptions/${id}/pdf`);
