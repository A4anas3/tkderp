import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/allApis';

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

  // Sync / Verify with backend on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const me = await authApi.getMe();
          setUser(me);
          localStorage.setItem('user', JSON.stringify(me));
        } catch (err) {
          console.warn('Session expired or invalid:', err.message);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
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
    const { access_token, user: userData } = res;
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
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
