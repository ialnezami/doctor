import client from './client';

export const getNotificationPrefs = () =>
  client.get('/users/me/notification-prefs');

export const updateNotificationPrefs = (prefs) =>
  client.patch('/users/me/notification-prefs', prefs);
