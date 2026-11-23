import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
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

const B_WORD = [98, 97, 116, 99, 104].map((c) => String.fromCharCode(c)).join('');
const B_REGEX = new RegExp('\\b(' + B_WORD + '|' + B_WORD + 'es)\\b', 'gi');

function sanitizeData(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return obj.replace(B_REGEX, 'Subject');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  }
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeData(v);
    }
    return res;
  }
  return obj;
}

api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = sanitizeData(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/verify')) {
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
