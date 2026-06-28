import client from './client';

export const submitReview = (appointmentId, rating, comment) =>
  client.post('/reviews', { appointmentId, rating, comment });

export const getMyReviews = (page = 1, rating = '') =>
  client.get('/reviews/mine', { params: { page, ...(rating ? { rating } : {}) } });

export const getDoctorReviews = (doctorId, page = 1) =>
  client.get(`/doctors/${doctorId}/reviews`, { params: { page } });

export const flagReview = (reviewId, flagReason = '') =>
  client.patch(`/reviews/${reviewId}/flag`, { flagReason });
