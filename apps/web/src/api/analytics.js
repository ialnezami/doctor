import client from './client';

export const getAnalyticsSummary = (params = {}) =>
  client.get('/analytics/summary', { params }).then(r => r.data);
