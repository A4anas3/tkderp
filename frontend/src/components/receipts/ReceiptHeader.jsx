import React from 'react';

export default function ReceiptHeader({
  documentTitle = 'OFFICIAL RECEIPT',
  copyType = 'STUDENT COPY',
  documentSubtitle = null,
}) {
  return (
    <div className="border-b-2 border-slate-900 pb-3 text-slate-900">
      {/* Top Bar: Institute Emblem + Name & Affiliation */}
      <div className="flex items-start justify-between gap-4">
        {/* Emblem / Seal SVG */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full border-2 border-slate-900 flex items-center justify-center shrink-0 bg-slate-50 p-1">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full text-slate-900 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer ring */}
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
              {/* Inner seal design: Open Book & Torch */}
              <path
                d="M50 22 L50 48 M50 22 C43 27 30 25 22 28 L22 66 C30 63 43 65 50 70 C57 65 70 63 78 66 L78 28 C70 25 57 27 50 22 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path d="M50 25 L50 69" stroke="currentColor" strokeWidth="2" />
              {/* Star on top */}
              <polygon points="50,9 52,15 58,15 53,19 55,25 50,21 45,25 47,19 42,15 48,15" fill="currentColor" />
              {/* Text arc representation */}
              <text x="50" y="86" fontSize="6.5" fontWeight="bold" textAnchor="middle" fill="currentColor" letterSpacing="0.8">
                ESTD. 2020
              </text>
            </svg>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight leading-none uppercase">
              THAKURDWARA COACHING INSTITUTE
            </h1>
            <p className="text-[11px] font-semibold text-slate-800 tracking-wide mt-1">
              Centre for Academic Excellence & Competitive Examinations
            </p>
            <p className="text-[10px] text-slate-600 font-medium">
              Govt. Regd. No: <strong className="text-black font-semibold">UP/TKD/2026/8941</strong> • ISO 9001:2015 Certified
            </p>
          </div>
        </div>

        {/* Right Info: Copy Badge & Helpline */}
        <div className="text-right shrink-0">
          {copyType && (
            <span className="inline-block bg-slate-900 text-white font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded tracking-widest border border-slate-900 mb-1">
              [{copyType}]
            </span>
          )}
          <p className="text-[10px] text-slate-700 font-medium">
            Civil Lines Road, Thakurdwara, UP - 244601
          </p>
          <p className="text-[10px] text-slate-700 font-medium">
            Helpline: <strong className="text-black">+91 98765 43210</strong>
          </p>
          <p className="text-[9px] text-slate-500">
            accounts@thakurdwara.edu.in
          </p>
        </div>
      </div>

      {/* Document Classification Title Strip */}
      <div className="mt-3 bg-slate-100 border-y border-slate-300 py-1 px-3 flex items-center justify-between">
        <span className="text-[11px] sm:text-xs font-black tracking-wider uppercase text-black font-mono">
          {documentTitle}
        </span>
        {documentSubtitle && (
          <span className="text-[10px] font-medium text-slate-600 italic">
            {documentSubtitle}
          </span>
        )}
      </div>
    </div>
  );
}
