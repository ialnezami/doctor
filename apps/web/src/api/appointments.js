import client from './client';
export const getAppointments = (params) => client.get('/appointments', { params });
export const createAppointment = (data) => client.post('/appointments', data);
export const updateStatus = (id, status, notes) => client.patch(`/appointments/${id}/status`, { status, notes });
