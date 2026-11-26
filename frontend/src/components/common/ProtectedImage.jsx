import React, { useState, useEffect } from 'react';
import { useProtectedImageSrc } from '../../utils/protectedImage';

/**
 * Renders a protected image fetched through the authenticated backend endpoint,
 * falling back cleanly when unavailable or unauthenticated.
 */
export default function ProtectedImage({
  src,
  alt = '',
  className = '',
  fallback = null,
}) {
  const { resolvedSrc, failed } = useProtectedImageSrc(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  if (resolvedSrc && !failed && !hasError) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        onError={() => setHasError(true)}
        className={className}
      />
    );
  }

  return fallback;
}
