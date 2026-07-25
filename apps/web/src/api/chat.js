import client from './client';

export const getMessages = (appointmentId, before) => {
  const params = before ? `?before=${before}&limit=20` : '?limit=20';
  return client.get(`/appointments/${appointmentId}/messages${params}`);
};

export const uploadAttachment = (appointmentId, formData) =>
  client.post(`/appointments/${appointmentId}/messages/upload`, formData);
