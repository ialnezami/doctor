import client from './client';

export const getMessages = (appointmentId, before) => {
  const params = before ? `?before=${before}&limit=20` : '?limit=20';
  return client.get(`/appointments/${appointmentId}/messages${params}`);
};

export const uploadAttachment = async (appointmentId, file) => {
  const form = new FormData();
  form.append('file', {
    uri:  file.uri,
    name: file.name || 'attachment',
    type: file.mimeType || 'application/octet-stream',
  });
  return client.post(`/appointments/${appointmentId}/messages/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
