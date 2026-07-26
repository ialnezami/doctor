import client from './client';

export const getVideoToken = (appointmentId) =>
  client.post(`/appointments/${appointmentId}/video/token`);
