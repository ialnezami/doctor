import client from './client';

export const getDoctors = (params) => client.get('/doctors', { params });
export const getDoctor = (id) => client.get(`/doctors/${id}`);
export const getAvailableSlots = (id, date) => client.get(`/doctors/${id}/available-slots`, { params: { date } });
export const updateDoctorSettings = (id, data) => client.patch(`/doctors/${id}/settings`, data);
