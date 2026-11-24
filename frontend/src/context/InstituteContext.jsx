import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../services/allApis';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'institute_gst_settings';

const DEFAULT_INSTITUTE = {
  institute_name: 'THAKURDWARA COACHING INSTITUTE',
  address: 'Civil Lines Road, Thakurdwara, UP - 244601',
  phone: '+91 98765 43210',
  email: 'accounts@thakurdwara.edu.in',
  gstin: '09AAACT1234F1Z5',
  gst_rate: '18.00',
  logo_url: null,
};

const InstituteContext = createContext(null);

export function InstituteProvider({ children }) {
  const { token } = useAuth();
  const [institute, setInstitute] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return { ...DEFAULT_INSTITUTE, ...JSON.parse(cached) };
      }
    } catch {
      // ignore invalid cache
    }
    return DEFAULT_INSTITUTE;
  });
  const [loading, setLoading] = useState(true);

  const persistAndSet = useCallback((data) => {
    if (!data) return;
    setInstitute((prev) => {
      const merged = {
        ...prev,
        ...data,
        institute_name: data.institute_name || prev.institute_name,
        address: data.address || prev.address,
        phone: data.phone || prev.phone,
        email: data.email || prev.email,
        logo_url: data.logo_url !== undefined ? data.logo_url : prev.logo_url,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore storage errors
      }
      return merged;
    });
  }, []);

  const refreshInstitute = useCallback(async () => {
    setLoading(true);
    try {
      const res = token
        ? await settingsApi.getInstitute()
        : await settingsApi.getPublicInstitute();
      if (res) {
        persistAndSet(res);
      }
    } catch (err) {
      if (token) {
        try {
          const pub = await settingsApi.getPublicInstitute();
          if (pub) persistAndSet(pub);
        } catch {
          // ignore fallback error
        }
      }
      console.warn('Could not refresh institute settings from server:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [token, persistAndSet]);

  useEffect(() => {
    refreshInstitute();
  }, [refreshInstitute]);

  useEffect(() => {
    if (institute?.institute_name) {
      document.title = `${institute.institute_name} - ERP`;
    }
  }, [institute?.institute_name]);

  return (
    <InstituteContext.Provider
      value={{
        institute,
        loading,
        refreshInstitute,
        setInstituteSettings: persistAndSet,
      }}
    >
      {children}
    </InstituteContext.Provider>
  );
}

export function useInstitute() {
  const ctx = useContext(InstituteContext);
  if (!ctx) {
    throw new Error('useInstitute must be used within an InstituteProvider');
  }
  return ctx;
}
