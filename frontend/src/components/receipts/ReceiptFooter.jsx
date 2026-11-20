import React from 'react';
import { numberToIndianWords } from '../../utils/numberToWords';

export default function ReceiptFooter({
  amount = null,
  amountInWords = null,
  collectorName = 'Authorized Officer',
  issuedDate = null,
  terms = [
    'Fees once deposited are strictly non-refundable and non-transferable under all circumstances.',
    'Please retain this original computer-generated slip for student identity card issuance & batch entry.',
    'Payments made via Cheque/Demand Draft/UPI are subject to actual bank clearing and realization.',
  ],
  customNote = null,
}) {
  const displayWords =
    amountInWords || (amount !== null ? numberToIndianWords(amount) : null);

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
    <div className="space-y-3 pt-2 text-slate-800 text-xs">
      {/* Amount In Indian Words Box */}
      {displayWords && (
        <div className="bg-slate-50 border border-slate-300 rounded p-2 text-xs">
          <div className="flex items-start gap-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] shrink-0">
              Amount In Words:
            </span>
            <span className="font-bold text-black font-serif italic text-xs tracking-wide">
              {displayWords}
            </span>
          </div>
        </div>
      )}

      {/* Custom Note if any */}
      {customNote && (
        <div className="text-[11px] text-slate-600 italic bg-amber-50/50 border border-amber-200 p-1.5 rounded">
          <strong>Note:</strong> {customNote}
        </div>
      )}

      {/* Terms and Authentic Signatures & Stamp */}
      <div className="grid grid-cols-12 gap-3 pt-2 border-t border-slate-300 items-end">
        {/* Left: Terms & Conditions */}
        <div className="col-span-7 space-y-1 text-[10px] leading-tight text-slate-600">
          <span className="font-bold text-slate-800 uppercase tracking-wider block text-[10px]">
            Statutory Terms & Rules:
          </span>
          <ol className="list-decimal pl-3 space-y-0.5">
            {terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
          <p className="text-[9px] text-slate-400 pt-1 font-mono">
            System generated document • Verified by Thakurdwara ERP Engine
          </p>
        </div>

        {/* Center/Right: Signatures and Stamp */}
        <div className="col-span-5 flex items-end justify-between gap-3 text-center">
          {/* Depositor / Student Sign */}
          <div className="flex-1">
            <div className="h-10 border-b border-dashed border-slate-400"></div>
            <p className="text-[10px] font-bold text-slate-800 mt-1">
              Student / Depositor
            </p>
            <p className="text-[9px] text-slate-500">Signature</p>
          </div>

          {/* Official Stamp & Authorized Signatory */}
          <div className="flex-1 relative flex flex-col items-center">
            {/* Stamp Simulation Badge */}
            <div className="w-16 h-16 rounded-full border border-indigo-700/60 p-0.5 flex items-center justify-center -mb-2 rotate-[-8deg] pointer-events-none select-none opacity-85">
              <div className="w-full h-full rounded-full border border-dashed border-indigo-700 flex flex-col items-center justify-center text-center p-0.5">
                <span className="text-[5.5px] font-black text-indigo-900 uppercase tracking-tighter leading-none">
                  THAKURDWARA
                </span>
                <span className="text-[6.5px] font-extrabold text-indigo-800 uppercase leading-none my-0.5">
                  ★ ACCOUNTS ★
                </span>
                <span className="text-[5px] font-bold text-indigo-950 uppercase tracking-tight leading-none">
                  VERIFIED
                </span>
              </div>
            </div>

            <div className="w-full border-b border-slate-900 mt-1"></div>
            <p className="text-[10px] font-black text-black mt-1">
              Authorized Signatory
            </p>
            <p className="text-[9px] text-slate-600 font-medium">
              {collectorName} • {formattedDate}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
