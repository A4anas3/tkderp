import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    let message =
      error.response?.data?.detail ||
      error.message ||
      'An unexpected error occurred';
    if (!error.response?.data?.detail && typeof error.response?.data === 'string') {
      const cleanText = error.response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanText) message = cleanText;
    }
    return Promise.reject(new Error(message));
  }
);

export default api;
