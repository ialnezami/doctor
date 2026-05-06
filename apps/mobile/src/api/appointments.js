import client from './client';
export const getAppointments = (p) => client.get('/appointments', { params: p });
export const createAppointment = (d) => client.post('/appointments', d);
export const updateStatus = (id, status) => client.patch(`/appointments/${id}/status`, { status });
