import React, { useId } from 'react';

/**
 * Circular rubber-stamp/seal ("mohr") displaying the institute name and Digitally Verified status.
 * Uses inline SVG with unique path IDs so it renders and prints crisply at small sizes.
 */
export default function VerifiedStamp({
  instituteName = 'THAKURDWARA COACHING INSTITUTE',
  className = 'w-16 h-16',
}) {
  const uid = useId().replace(/:/g, '');
  const topArcId = `verified-stamp-top-${uid}`;
  const bottomArcId = `verified-stamp-bot-${uid}`;

  const cleanName = (instituteName || 'THAKURDWARA COACHING INSTITUTE').trim().toUpperCase();
  const topFontSize =
    cleanName.length <= 22 ? 8.2 : Math.max(4.8, Math.min(8.2, 210 / cleanName.length));

  return (
    <div
      className={`inline-flex items-center justify-center -rotate-6 select-none pointer-events-none shrink-0 ${className}`}
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
    >
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label={`${cleanName} Digitally Verified Stamp`}
      >
        <defs>
          {/* Clockwise upper arc (r=40, 160deg -> 20deg) for institute name */}
          <path id={topArcId} d="M 22.41,73.68 A 40,40 0 1,1 97.59,73.68" />
          {/* Counter-clockwise lower arc (r=48, 145deg -> 35deg) for bottom seal label */}
          <path id={bottomArcId} d="M 20.68,87.53 A 48,48 0 0,0 99.32,87.53" />
        </defs>

        {/* Outer double rubber-stamp rings */}
        <circle
          cx="60"
          cy="60"
          r="56"
          fill="rgba(30, 58, 138, 0.04)"
          stroke="#1e3a8a"
          strokeWidth="2.5"
        />
        <circle
          cx="60"
          cy="60"
          r="51.5"
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="1"
        />

        {/* Inner dashed seal ring */}
        <circle
          cx="60"
          cy="60"
          r="35"
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />

        {/* Curved Institute Name along upper ring */}
        <text
          fill="#1e3a8a"
          fontSize={topFontSize}
          fontWeight="800"
          letterSpacing="0.4"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
            {cleanName}
          </textPath>
        </text>

        {/* Curved bottom seal caption */}
        <text
          fill="#1e3a8a"
          fontSize="6.8"
          fontWeight="800"
          letterSpacing="0.7"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          <textPath href={`#${bottomArcId}`} startOffset="50%" textAnchor="middle">
            ★ OFFICIAL SEAL ★
          </textPath>
        </text>

        {/* Inner upper checkmark & lower label */}
        <text
          x="60"
          y="42"
          textAnchor="middle"
          fill="#1e3a8a"
          fontSize="9.5"
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          ✓
        </text>
        <text
          x="60"
          y="82.5"
          textAnchor="middle"
          fill="#1e3a8a"
          fontSize="6.4"
          fontWeight="800"
          letterSpacing="0.8"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          AUTHORIZED
        </text>

        {/* Center Digitally Verified stamp banner */}
        <rect
          x="10"
          y="49"
          width="100"
          height="22"
          rx="3"
          fill="#ffffff"
          fillOpacity="0.95"
          stroke="#1e3a8a"
          strokeWidth="1.8"
        />
        <rect
          x="12.5"
          y="51.5"
          width="95"
          height="17"
          rx="1.5"
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="0.7"
        />
        <text
          x="60"
          y="62.8"
          textAnchor="middle"
          fill="#1e3a8a"
          fontSize="8.5"
          fontWeight="800"
          letterSpacing="0.3"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          Digitally Verified
        </text>
      </svg>
    </div>
  );
}
