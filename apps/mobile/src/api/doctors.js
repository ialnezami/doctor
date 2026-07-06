import client from './client';

export const getDoctors = (params = {}) => client.get('/doctors', { params });
export const getDoctor = (id) => client.get(`/doctors/${id}`);
export const getMyDoctorProfile = () => client.get('/doctors/me');
export const getAvailableSlots = (id, date) => client.get(`/doctors/${id}/available-slots`, { params: { date } });
export const getDoctorLocations = (id) => client.get(`/doctors/${id}/locations`);
export const updateDoctorSettings = (id, data) => client.patch(`/doctors/${id}/settings`, data);
export const getPlatformCurrencies = () => client.get('/doctors/currencies');
