import client from './client';

export const getInvoices = (params = {}) =>
  client.get('/invoices', { params }).then(r => r.data);

export const markInvoicePaid = (appointmentId) =>
  client.patch(`/invoices/${appointmentId}/pay`).then(r => r.data);
