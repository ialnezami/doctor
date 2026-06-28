import client from './client';

// Existing
export const getAppointments    = (p)    => client.get('/appointments', { params: p });
export const createAppointment  = (d)    => client.post('/appointments', d);
export const updateStatus       = (id, status) => client.patch(`/appointments/${id}/status`, { status });

// Lifecycle
export const getAppointment     = (id)   => client.get(`/appointments/${id}`).then(r => r.data);
export const confirmAppointment = (id)   => client.patch(`/appointments/${id}/confirm`).then(r => r.data);
export const validateAppointment= (id)   => client.patch(`/appointments/${id}/validate`).then(r => r.data);
export const cancelAppointment  = (id)   => client.patch(`/appointments/${id}/cancel`).then(r => r.data);

// Consultation notes
export const addNote    = (apptId, data)            => client.post(`/appointments/${apptId}/notes`, data).then(r => r.data);
export const getNotes   = (apptId)                  => client.get(`/appointments/${apptId}/notes`).then(r => r.data);
export const updateNote = (apptId, noteId, data)    => client.patch(`/appointments/${apptId}/notes/${noteId}`, data).then(r => r.data);
export const deleteNote = (apptId, noteId)          => client.delete(`/appointments/${apptId}/notes/${noteId}`).then(r => r.data);

// Read tracking
export const markRead   = (apptId)                  => client.post(`/appointments/${apptId}/read`).then(r => r.data);

// Reminder opt-out
export const toggleReminderOptOut = (id, disabled) =>
  client.patch(`/appointments/${id}/reminders-opt-out`, { disabled }).then(r => r.data);

// AI symptom intake
export const submitSymptoms = (appointmentId, symptomText) =>
  client.patch(`/appointments/${appointmentId}/symptoms`, { symptomText });
