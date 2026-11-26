import React, { useState, useEffect } from 'react';
import { useProtectedImageSrc } from '../../utils/protectedImage';

/**
 * Displays the institute's saved logo image with automatic fallback
 * when no logo is configured or the image fails to load.
 */
export default function InstituteLogo({
  src,
  alt = 'Institute Logo',
  className = 'w-8 h-8 object-contain',
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
