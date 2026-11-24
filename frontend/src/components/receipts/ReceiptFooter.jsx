import React from 'react';
import { numberToIndianWords } from '../../utils/numberToWords';
import { useInstitute } from '../../context/InstituteContext';

export default function ReceiptFooter({
  amount = null,
  amountInWords = null,
  collectorName = 'Authorized Officer',
  issuedDate = null,
  terms = [
    'Fees once deposited are strictly non-refundable and non-transferable under all circumstances.',
    'Please retain this original computer-generated slip for student identity card issuance & class entry.',
    'Payments made via Cheque/Demand Draft/UPI are subject to actual bank clearing and realization.',
  ],
  customNote = null,
}) {
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';
  const displayWords =
    amountInWords || (amount !== null && !isNaN(Number(amount)) ? numberToIndianWords(Number(amount)) : null);

  const formattedDate = issuedDate
    ? new Date(issuedDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

  return (
    <div className="space-y-3 pt-2 text-black text-xs summary-box">
      {/* Amount In Indian Words Box */}
      {displayWords && (
        <div className="bg-slate-50 border border-slate-300 rounded p-2.5 text-xs">
          <div className="flex flex-col sm:flex-row print:flex-row sm:items-center print:items-center gap-1 sm:gap-2 print:gap-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] shrink-0">
              Amount in Words:
            </span>
            <span className="font-bold text-black font-serif italic text-xs tracking-wide">
              {displayWords}
            </span>
          </div>
        </div>
      )}

      {/* Custom Note if any */}
      {customNote && (
        <div className="text-[11px] text-slate-800 italic bg-amber-50/70 border border-amber-300 p-2 rounded">
          <strong className="text-black font-semibold">Note:</strong> {customNote}
        </div>
      )}

      {/* Terms and Authentic Signatures & Stamp */}
      <div className="grid grid-cols-1 sm:grid-cols-12 print:grid-cols-12 gap-3 pt-2.5 border-t border-slate-300 items-end">
        {/* Left: Statutory Terms */}
        <div className="sm:col-span-7 print:col-span-7 space-y-1 text-[10px] leading-tight text-slate-700">
          <span className="font-bold text-black uppercase tracking-wider block text-[10px]">
            Statutory Terms & Rules:
          </span>
          <ol className="list-decimal pl-3.5 space-y-0.5">
            {terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
          <p className="text-[9px] text-slate-500 pt-1 font-mono">
            Computer-Generated Official Document • Verified by {instituteName}
          </p>
        </div>

        {/* Right: Authentic Signatures & Stamp Simulation */}
        <div className="sm:col-span-5 print:col-span-5 flex items-end justify-between gap-3 text-center pt-2 sm:pt-0 print:pt-0">
          {/* Depositor / Student Sign */}
          <div className="flex-1">
            <div className="h-10 border-b border-dashed border-slate-400"></div>
            <p className="text-[10px] font-bold text-black mt-1">
              Student / Depositor
            </p>
            <p className="text-[9px] text-slate-500">Signature</p>
          </div>

          {/* Official Stamp & Authorized Signatory */}
          <div className="flex-1 relative flex flex-col items-center">
            {/* Stamp Simulation Badge */}
            <div className="w-16 h-16 rounded-full border border-indigo-700/70 p-0.5 flex items-center justify-center -mb-2 rotate-[-6deg] pointer-events-none select-none opacity-90">
              <div className="w-full h-full rounded-full border border-dashed border-indigo-700 flex flex-col items-center justify-center text-center p-0.5">
                <span className="text-[4.5px] font-black text-indigo-950 uppercase tracking-tighter leading-tight line-clamp-2 px-0.5">
                  {instituteName}
                </span>
                <span className="text-[6.5px] font-extrabold text-indigo-900 uppercase leading-none my-0.5">
                  ★ ACCOUNTS ★
                </span>
                <span className="text-[5px] font-bold text-indigo-950 uppercase tracking-tight leading-none">
                  VERIFIED
                </span>
              </div>
            </div>

            <div className="w-full border-b border-black mt-1"></div>
            <p className="text-[10px] font-black text-black mt-1">
              Authorized Signatory
            </p>
            <p className="text-[9px] text-slate-700 font-medium font-mono">
              {collectorName} • {formattedDate}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
