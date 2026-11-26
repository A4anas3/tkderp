import { useState, useEffect } from 'react';
import api from '../services/api';

const blobUrlCache = new Map();
const inFlightRequests = new Map();

if (typeof window !== 'undefined') {
  window.addEventListener('auth:cleared', () => {
    for (const url of blobUrlCache.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore revoke errors
      }
    }
    blobUrlCache.clear();
    inFlightRequests.clear();
  });
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export const PUBLIC_INSTITUTE_LOGO_URL = `${API_BASE_URL}/public/institute-logo`;

/**
 * Resolve an institute logo reference for unauthenticated public pages
 * (login, public ID card, public verification) to the dedicated public
 * backend logo endpoint, returning null when no logo is configured.
 */
export function resolvePublicInstituteLogoUrl(src) {
  if (!src || typeof src !== 'string') return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed === PUBLIC_INSTITUTE_LOGO_URL ||
    trimmed.startsWith('/api/public/institute-logo')
  ) {
    return trimmed;
  }
  return PUBLIC_INSTITUTE_LOGO_URL;
}

/**
 * Normalize an image reference (storage key, legacy /uploads/..., or /api/v1/uploads/...)
 * into a backend-served /api/v1/uploads/... path, preserving data:/blob:/http(s): and public API URLs.
 */
export function normalizeProtectedImageUrl(src) {
  if (!src || typeof src !== 'string') return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed === PUBLIC_INSTITUTE_LOGO_URL ||
    trimmed.startsWith('/api/public/')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/api/v1/uploads/')) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/')) {
    return `/api/v1${trimmed}`;
  }
  return `/api/v1/uploads/${trimmed.replace(/^\/+/, '')}`;
}

async function fetchProtectedBlobUrl(normalizedUrl) {
  if (blobUrlCache.has(normalizedUrl)) {
    return blobUrlCache.get(normalizedUrl);
  }
  if (inFlightRequests.has(normalizedUrl)) {
    return inFlightRequests.get(normalizedUrl);
  }

  const apiPath = normalizedUrl.startsWith('/api/')
    ? normalizedUrl.slice(4) // strip '/api' since api.js baseURL already includes '/api'
    : normalizedUrl;

  const promise = api
    .get(apiPath, { responseType: 'blob' })
    .then((res) => {
      const objectUrl = URL.createObjectURL(res.data);
      blobUrlCache.set(normalizedUrl, objectUrl);
      return objectUrl;
    })
    .finally(() => {
      inFlightRequests.delete(normalizedUrl);
    });

  inFlightRequests.set(normalizedUrl, promise);
  return promise;
}

/**
 * React hook that resolves a protected backend image path into a renderable src
 * by fetching it with the logged-in user's JWT token.
 */
export function useProtectedImageSrc(src) {
  const normalized = normalizeProtectedImageUrl(src);
  const isProtectedPath = Boolean(normalized && normalized.startsWith('/api/v1/uploads/'));

  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!normalized) return null;
    if (!isProtectedPath) return normalized;
    return blobUrlCache.get(normalized) || null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!normalized) {
      setResolvedSrc(null);
      return;
    }
    if (!isProtectedPath) {
      setResolvedSrc(normalized);
      return;
    }
    if (!localStorage.getItem('token')) {
      setResolvedSrc(null);
      return;
    }

    const cached = blobUrlCache.get(normalized);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    let cancelled = false;
    fetchProtectedBlobUrl(normalized)
      .then((objectUrl) => {
        if (!cancelled) {
          setResolvedSrc(objectUrl);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(null);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalized, isProtectedPath]);

  return { resolvedSrc, failed };
}
