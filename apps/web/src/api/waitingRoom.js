import client from './client';

// client interceptor already unwraps res.data, so responses are the payload directly
export const getWaitingRoom = ()   => client.get('/waiting-room');
export const callPatient    = (id) => client.patch(`/waiting-room/${id}/call`);
