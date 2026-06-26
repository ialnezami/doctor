import client from './client';

export const listNotifications    = ()    => client.get('/notifications').then(r => r.data);
export const markNotificationRead = (id)  => client.patch(`/notifications/${id}/read`).then(r => r.data);
export const markAllRead          = ()    => client.patch('/notifications/read-all').then(r => r.data);
