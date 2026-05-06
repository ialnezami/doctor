import axios from 'axios';
import C from '../constants/colors';
import useAuthStore from '../store/authStore';

const client = axios.create({ baseURL: C.API_URL });

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(err.response?.data || err);
  }
);

export default client;
