import client from './client';

export const submitReview = (appointmentId, rating, comment) =>
  client.post('/reviews', { appointmentId, rating, comment }).then(r => r.data);

export const getDoctorReviews = (doctorUserId, page = 1) =>
  client.get(`/doctors/${doctorUserId}/reviews`, { params: { page } }).then(r => r.data);

export const flagReview = (reviewId, flagReason = '') =>
  client.patch(`/reviews/${reviewId}/flag`, { flagReason }).then(r => r.data);
