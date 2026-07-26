import client from './client';

export const getPharmacyProfile    = ()          => client.get('/pharmacies/me');
export const updatePharmacyProfile = (d)         => client.patch('/pharmacies/me', d);
export const getProducts           = (params)    => client.get('/products', { params });
export const createProduct         = (d)         => client.post('/products', d);
export const adjustStock           = (id, delta) => client.patch(`/products/${id}/stock`, { delta });
export const createSale            = (d)         => client.post('/sales', d);
export const getSales              = ()          => client.get('/sales');
