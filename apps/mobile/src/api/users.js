import client from './client';

export const getNotificationPrefs = () =>
  client.get('/users/me/notification-prefs').then(r => r.data);

export const updateNotificationPrefs = (prefs) =>
  client.patch('/users/me/notification-prefs', prefs).then(r => r.data);
