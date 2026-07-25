import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const adminClient = axios.create({ baseURL: API_BASE });

adminClient.interceptors.request.use(config => {
  const secret = sessionStorage.getItem('admin-secret');
  if (secret) config.headers['x-admin-secret'] = secret;
  return config;
});

adminClient.interceptors.response.use(r => r.data, e => Promise.reject(e));

export default adminClient;
