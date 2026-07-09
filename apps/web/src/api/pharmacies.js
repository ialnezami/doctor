import client from './client';

export const getPharmacyProfile   = ()          => client.get('/pharmacies/me');
export const updatePharmacyProfile = (d)         => client.patch('/pharmacies/me', d);
export const updatePharmacyLocation = (d)        => client.put('/pharmacies/me/location', d);

export const getProducts   = (params)    => client.get('/products', { params });
export const createProduct = (d)         => client.post('/products', d);
export const updateProduct = (id, d)     => client.patch(`/products/${id}`, d);
export const deleteProduct = (id)        => client.delete(`/products/${id}`);
export const adjustStock   = (id, delta) => client.patch(`/products/${id}/stock`, { delta });

export const createSale = (d)       => client.post('/sales', d);
export const getSales   = (params)  => client.get('/sales', { params });
