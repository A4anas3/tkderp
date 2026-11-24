import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/allApis';
import { clearAuthStorage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleTokenRefreshed = (event) => {
      const { access_token, user: refreshedUser } = event.detail || {};
      if (access_token) {
        setToken(access_token);
      }
      if (refreshedUser) {
        setUser(refreshedUser);
      }
    };
    const handleAuthCleared = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);
    window.addEventListener('auth:cleared', handleAuthCleared);
    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
      window.removeEventListener('auth:cleared', handleAuthCleared);
    };
  }, []);

  // Sync / Verify with backend on mount (and transparently refresh if access token expired)
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedRefreshToken = localStorage.getItem('refresh_token');
      if (storedToken || storedRefreshToken) {
        try {
          const me = await authApi.getMe();
          setUser(me);
          setToken(localStorage.getItem('token'));
          localStorage.setItem('user', JSON.stringify(me));
        } catch (err) {
          console.warn('Session expired or invalid:', err.message);
          clearAuthStorage();
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login(username, password);
    const { access_token, refresh_token, user: userData } = res;
    localStorage.setItem('token', access_token);
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token);
    }
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem('refresh_token');
    const storedToken = localStorage.getItem('token');
    try {
      if (storedRefreshToken || storedToken) {
        await authApi.logout(storedRefreshToken);
      }
    } catch {
      // Ignore server/network errors during logout; always clear local session
    } finally {
      clearAuthStorage();
      setToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const role = user?.role || null;
  const isAdmin = role === 'ADMIN';
  const isCashier = role === 'CASHIER';
  const isTeacher = role === 'TEACHER';
  const canManageAdmissions = isAdmin || isCashier;
  const canCollectFees = isAdmin || isCashier;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        loading,
        isAdmin,
        isCashier,
        isTeacher,
        canManageAdmissions,
        canCollectFees,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
