import client from './client';

export const getNearbyMapPins = ({ swLat, swLng, neLat, neLng, specialty }) =>
  client.get('/map/nearby', { params: { swLat, swLng, neLat, neLng, specialty } });

export const updateLabLocation = (lat, lng) =>
  client.put('/labs/me/location', { lat, lng });
