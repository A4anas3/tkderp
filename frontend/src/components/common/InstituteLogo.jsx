import React, { useState, useEffect } from 'react';

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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setHasError(true)}
        className={className}
      />
    );
  }

  return fallback;
}
