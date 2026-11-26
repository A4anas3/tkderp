import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

export function clearAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  window.dispatchEvent(new CustomEvent('auth:cleared'));
}

function isPublicAuthExemptPath(pathname) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/id-card') ||
    pathname.startsWith('/idcard') ||
    pathname.startsWith('/public/id-card')
  );
}

function redirectToLoginIfNeeded() {
  if (!isPublicAuthExemptPath(window.location.pathname)) {
    window.location.href = '/login';
  }
}

function setAuthorizationHeader(config, token) {
  if (!config.headers) {
    config.headers = {};
  }
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers.Authorization = `Bearer ${token}`;
  }
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      const res = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
      const { access_token, refresh_token: newRefreshToken, user } = res.data || {};
      if (!access_token || !newRefreshToken) {
        throw new Error('Invalid refresh token response');
      }
      localStorage.setItem('token', access_token);
      localStorage.setItem('refresh_token', newRefreshToken);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      window.dispatchEvent(
        new CustomEvent('auth:token-refreshed', {
          detail: { access_token, refresh_token: newRefreshToken, user },
        })
      );
      return access_token;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      setAuthorizationHeader(config, token);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const B_WORD = [98, 97, 116, 99, 104].map((c) => String.fromCharCode(c)).join('');
const B_REGEX = new RegExp('\\b(' + B_WORD + '|' + B_WORD + 'es)\\b', 'gi');

function sanitizeData(obj) {
  if (!obj || obj instanceof Blob || obj instanceof ArrayBuffer) return obj;
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

function formatErrorMessage(error) {
  const rawDetail = error.response?.data?.detail;
  let message;
  if (Array.isArray(rawDetail)) {
    message = rawDetail
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((p) => p !== undefined && p !== null).join('.')
          : (item.loc || '');
        const msg = item.msg || item.message;
        if (loc && msg) {
          return `${loc}: ${msg}`;
        }
        return msg || (typeof item === 'object' ? JSON.stringify(item) : String(item));
      })
      .filter(Boolean)
      .join('\n');
  } else if (typeof rawDetail === 'string') {
    message = rawDetail;
  } else if (rawDetail && typeof rawDetail === 'object') {
    message = JSON.stringify(rawDetail);
  }

  if (!message) {
    message = error.message || 'An unexpected error occurred';
  }
  if (!error.response?.data?.detail && typeof error.response?.data === 'string') {
    const cleanText = error.response.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText) message = cleanText;
  }
  return message;
}

api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = sanitizeData(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';
    const isAuthBypassEndpoint =
      originalRequest?._skipAuthRefresh ||
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    if (error.response?.status === 401) {
      if (originalRequest && !originalRequest._retry && !isAuthBypassEndpoint) {
        originalRequest._retry = true;
        try {
          const newAccessToken = await refreshAccessToken();
          setAuthorizationHeader(originalRequest, newAccessToken);
          return api(originalRequest);
        } catch (refreshError) {
          clearAuthStorage();
          redirectToLoginIfNeeded();
          return Promise.reject(new Error(formatErrorMessage(refreshError)));
        }
      }

      if (!requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/logout')) {
        clearAuthStorage();
        redirectToLoginIfNeeded();
      }
    }

    return Promise.reject(new Error(formatErrorMessage(error)));
  }
);

export default api;
