import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Printer,
  Calendar,
  BookOpen,
  User,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  FileCheck2,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function PublicIDCardPage() {
  const { identifier: pathIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Route prefix (e.g. /verify or /id-card)
  const isVerifyRoute = location.pathname.startsWith('/verify');
  const basePath = isVerifyRoute ? '/verify' : '/id-card';

  // Identifier can come from route params or query params (?admission_no=... or ?identifier=...)
  const queryParamIdent = searchParams.get('admission_no') || searchParams.get('identifier') || '';
  const currentIdentifier = (pathIdentifier || queryParamIdent || '').trim();

  const [inputVal, setInputVal] = useState(currentIdentifier);
  const [loading, setLoading] = useState(Boolean(currentIdentifier));
  const [cardData, setCardData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState(''); // 'NOT_ACTIVE' | 'NOT_FOUND' | 'RATE_LIMITED' | 'GENERAL'

  // Sync input value if route changes
  useEffect(() => {
    if (currentIdentifier) {
      setInputVal(currentIdentifier);
    }
  }, [currentIdentifier]);

  // Fetch public ID card data when identifier is provided
  useEffect(() => {
    if (!currentIdentifier) {
      setLoading(false);
      setCardData(null);
      setErrorMsg('');
      setErrorType('');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg('');
    setErrorType('');
    setCardData(null);

    axios
      .get(`/api/public/id-card/${encodeURIComponent(currentIdentifier)}`)
      .then((res) => {
        if (isMounted) {
          setCardData(res.data);
          setErrorMsg('');
          setErrorType('');
        }
      })
      .catch((err) => {
        if (isMounted) {
          const status = err.response?.status;
          const detail = err.response?.data?.detail || '';

          if (status === 429) {
            setErrorType('RATE_LIMITED');
            setErrorMsg(detail || 'Too many requests. Please wait a moment before trying again.');
          } else if (
            status === 404 &&
            (detail.toLowerCase().includes('no active enrolment') ||
              detail.toLowerCase().includes('no active enrollment') ||
              detail.toLowerCase().includes('no active subject') ||
              detail.toLowerCase().includes('not available'))
          ) {
            setErrorType('NOT_ACTIVE');
            setErrorMsg(detail || 'No active enrolment / ID card is available for this student.');
          } else if (
            status === 404 &&
            (detail.toLowerCase().includes('no matching') || detail.toLowerCase().includes('not found'))
          ) {
            setErrorType('NOT_FOUND');
            setErrorMsg(
              detail ||
                `No student or admission record found matching identifier '${currentIdentifier}'.`
            );
          } else {
            setErrorType('GENERAL');
            setErrorMsg(
              detail ||
                err.message ||
                'Unable to retrieve student ID card. Please verify the admission number.'
            );
          }
          setCardData(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentIdentifier]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (trimmed) {
      navigate(`${basePath}/${encodeURIComponent(trimmed)}`);
    } else {
      navigate(basePath);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrTargetUrl = cardData?.student?.admission_number
    ? `${origin}/id-card/${encodeURIComponent(cardData.student.admission_number)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-50 text-black font-sans py-6 px-3 sm:px-6 flex flex-col justify-between">
      <div className="max-w-2xl mx-auto w-full space-y-5">
        {/* Top Institute Header Banner (no-print) */}
        <div className="bg-white border-2 border-black rounded-xl p-4 sm:p-5 shadow-xs text-center relative overflow-hidden no-print">
          <div className="flex items-center justify-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-odoo-800 shrink-0" />
            <h1 className="text-base sm:text-xl font-black text-black tracking-wide uppercase">
              THAKURDWARA COACHING INSTITUTE
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">
            Official Public Student Identity Card Portal
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[11px] text-slate-700 font-medium">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Instant updated ID card with verified active enrolment</span>
          </div>
        </div>

        {/* Search Input Box (no-print) */}
        <div className="bg-white border-2 border-slate-300 rounded-xl p-3 sm:p-4 shadow-2xs no-print">
          <form onSubmit={handleSearchSubmit} className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Enter Admission Number
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Enter Admission Number (e.g. ADM-2026-0001)..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-odoo-500 font-mono"
                  autoFocus={!currentIdentifier}
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2 bg-odoo-700 hover:bg-odoo-800 active:bg-odoo-900 text-white rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
              >
                <FileCheck2 className="w-4 h-4" />
                Get ID Card
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter your official admission number (e.g. ADM-2026-0001) to view the student identity card.
              Identity cards are available only for active course enrolments.
            </p>
          </form>
        </div>

        {/* Initial Prompt when no identifier is entered */}
        {!currentIdentifier && !loading && !errorMsg && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2 shadow-2xs no-print">
            <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-bold text-black">Enter Admission Number</h2>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Please enter an admission number (e.g. <span className="font-mono font-bold text-black">ADM-2026-0001</span>) in the search box above and click{' '}
              <strong className="text-black">Get ID Card</strong> to view the student's official identity card.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3 shadow-xs no-print">
            <div className="w-10 h-10 border-4 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-sm font-bold text-black">Retrieving Updated ID Card...</h2>
            <p className="text-xs text-slate-600 font-mono">Querying: {currentIdentifier}</p>
          </div>
        )}

        {/* Error State: NO ACTIVE ENROLMENT (Never show card, never leak data) */}
        {!loading && errorType === 'NOT_ACTIVE' && (
          <div className="bg-white border-2 border-amber-400 rounded-xl p-5 sm:p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-amber-900 uppercase">
                No Active Enrolment / ID Card Available
              </h2>
              <p className="text-xs sm:text-sm text-amber-800 font-medium mt-1 max-w-md mx-auto">
                No active enrolment or valid ID card is available for identifier{' '}
                <span className="font-mono font-bold text-black bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                  {currentIdentifier}
                </span>
                .
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 text-left space-y-1.5 max-w-lg mx-auto">
              <p className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0" />
                Why is the ID card not available?
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800 pl-1">
                <li>The student has no currently active subject or course enrolment.</li>
                <li>The enrollment period has expired and is awaiting renewal.</li>
                <li>
                  Per institute policy, identity cards are strictly available only during active
                  course validity.
                </li>
              </ul>
              <p className="text-[11px] text-amber-900 pt-1 border-t border-amber-200">
                Please contact the institute front desk or cashier office to renew your course
                subscription.
              </p>
            </div>
          </div>
        )}

        {/* Error State: NOT FOUND */}
        {!loading && errorType === 'NOT_FOUND' && (
          <div className="bg-white border-2 border-rose-400 rounded-xl p-5 sm:p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-rose-900 uppercase">
                Student ID Card Not Found
              </h2>
              <p className="text-xs sm:text-sm text-rose-800 mt-1 max-w-md mx-auto">
                No matching student or admission record found for admission number{' '}
                <span className="font-mono font-bold text-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">{currentIdentifier}</span>. Please verify the admission number and try again.
              </p>
            </div>
          </div>
        )}

        {/* Error State: RATE LIMITED */}
        {!loading && errorType === 'RATE_LIMITED' && (
          <div className="bg-white border-2 border-rose-400 rounded-xl p-5 sm:p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-rose-900 uppercase">
                Rate Limit Exceeded
              </h2>
              <p className="text-xs text-rose-800 mt-1 max-w-md mx-auto">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Error State: GENERAL */}
        {!loading && errorType === 'GENERAL' && (
          <div className="bg-white border-2 border-slate-300 rounded-xl p-5 sm:p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 uppercase">Notice</h2>
              <p className="text-xs text-slate-700 mt-1 max-w-md mx-auto">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* ACTIVE UPDATED ID CARD SECTION (ONLY when active subjects exist) */}
        {!loading && cardData && cardData.student && cardData.active_courses?.length > 0 && (
          <div className="space-y-4">
            {/* Top Card Controls Bar (no-print) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white border border-slate-300 rounded-xl shadow-2xs no-print">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-black">
                    Verified Active Enrolment
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Official ID card ready for verification & printing
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-odoo-700 hover:bg-odoo-800 text-white rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Print ID Card
                </button>
              </div>
            </div>

            {/* Printable ID Card Container */}
            <div className="printable-id-card-wrapper py-2 flex justify-center">
              <div
                id="printable-id-card"
                className="printable-id-card w-full max-w-[440px] bg-white border-2 border-black rounded-xl overflow-hidden shadow-md text-black"
              >
                {/* Card Header: Institute Emblem & Details */}
                <div className="bg-slate-900 text-white px-4 py-3.5 text-center relative border-b-2 border-amber-500">
                  <div className="flex items-center justify-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                    <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white">
                      THAKURDWARA COACHING INSTITUTE
                    </h1>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-200 font-medium tracking-tight mt-0.5">
                    Civil Lines, Thakurdwara (U.P.) • ISO 9001:2015 Certified
                  </p>
                  <div className="mt-1.5 inline-block">
                    <span className="bg-amber-400 text-slate-950 font-black text-[10px] tracking-widest uppercase px-3 py-0.5 rounded-full shadow-2xs">
                      STUDENT IDENTITY CARD
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3.5 bg-white">
                  {/* Student Identification Row: Photo + Primary Metadata */}
                  <div className="flex items-start gap-3.5 border-b border-slate-200 pb-3">
                    {/* Photo Frame */}
                    <div className="w-24 h-28 sm:w-28 sm:h-32 border-2 border-black rounded-lg overflow-hidden bg-slate-100 shrink-0 shadow-xs flex items-center justify-center">
                      {cardData.student.photo_url ? (
                        <img
                          src={cardData.student.photo_url}
                          alt={cardData.student.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-700 p-2 text-center h-full">
                          <User className="w-8 h-8 text-slate-500 mb-1" />
                          <span className="text-[10px] font-bold uppercase leading-tight text-black">
                            {cardData.student.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info Column */}
                    <div className="min-w-0 flex-1 space-y-1 text-xs">
                      <div>
                        <h2 className="text-sm sm:text-base font-black text-black uppercase leading-tight truncate">
                          {cardData.student.name}
                        </h2>
                        {cardData.student.father_name && (
                          <p className="text-[11px] text-zinc-950 font-semibold truncate">
                            S/D of: {cardData.student.father_name}
                          </p>
                        )}
                      </div>

                      <div className="pt-0.5 space-y-1">
                        {/* Student ID */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-800 uppercase w-20 shrink-0">
                            Student ID:
                          </span>
                          <span className="font-mono font-black text-black bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
                            {cardData.student.student_code}
                          </span>
                        </div>

                        {/* Admission Number */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-800 uppercase w-20 shrink-0">
                            Admission No:
                          </span>
                          <span className="font-mono font-black text-black bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                            {cardData.student.admission_number}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="pt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                            ● {cardData.student.status || 'ACTIVE'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Enrolled Active Courses Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-odoo-800 shrink-0" />
                        Enrolled Active Courses ({cardData.active_courses.length})
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Active & Valid
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5">
                      {cardData.active_courses.map((course, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-slate-50 rounded-lg border border-slate-300 text-xs space-y-1"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="font-bold text-black leading-tight flex-1">
                              {course.course_name}
                            </span>

                          </div>

                          {/* Faculty & Hall Details */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700 font-medium">
                            {course.teacher_name && (
                              <span>
                                Faculty: <strong className="text-black">{course.teacher_name}</strong>
                              </span>
                            )}
                            {course.hall_number && (
                              <span>
                                Hall: <strong className="text-black">{course.hall_number}</strong>
                              </span>
                            )}
                          </div>

                          {/* Class Timing */}
                          {course.schedule && (
                            <div className="text-[10px] text-slate-700 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>Timing: <strong className="text-black">{course.schedule}</strong></span>
                            </div>
                          )}

                          {/* Validity Period */}
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5 border-t border-slate-200">
                            <span className="font-bold text-odoo-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-odoo-700 shrink-0" />
                              {course.validity_period}
                            </span>

                            {course.days_remaining !== null && course.days_remaining !== undefined && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  course.days_remaining <= 5
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                }`}
                              >
                                {course.days_remaining}d remaining
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Due Balance (Small, unobtrusive text) */}
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 flex items-center justify-between">
                    <span>Account Dues:</span>
                    <span className="font-mono font-semibold text-slate-700">
                      Due Balance: ₹{Number(cardData.due_balance !== undefined ? cardData.due_balance : (cardData.student?.due_balance || 0)).toFixed(2)}
                    </span>
                  </div>

                  {/* Card Footer: Verification QR Code & Official Signatory */}
                  <div className="pt-2 border-t-2 border-black flex items-center justify-between gap-3">
                    {/* QR Code Verifier pre-filled with admission number */}
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 bg-white border border-black rounded shadow-2xs shrink-0">
                        <QRCodeSVG
                          value={qrTargetUrl}
                          size={76}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div className="space-y-0.5 text-[9px] sm:text-[10px] leading-tight">
                        <p className="font-black text-black uppercase">SCAN FOR ID CARD</p>
                        <p className="text-slate-700 font-medium">Instant Authenticity</p>
                        <p className="font-mono text-[8px] text-slate-600 break-all max-w-[130px]">
                          /id-card/{cardData.student.admission_number}
                        </p>
                      </div>
                    </div>

                    {/* Signatory & Seal */}
                    <div className="text-right space-y-1">
                      <div className="w-24 border-b border-black inline-block pb-0.5">
                        <span className="font-serif italic text-[11px] text-slate-700">Auth Sign</span>
                      </div>
                      <p className="text-[9px] font-black uppercase text-black tracking-wider">
                        Authorized Signatory
                      </p>
                      <p className="text-[8px] text-slate-600 font-medium">
                        Thakurdwara ERP Verified
                      </p>
                    </div>
                  </div>

                  {/* Bottom Instructions Notice */}
                  <div className="text-[8px] sm:text-[9px] text-center text-slate-600 border-t border-slate-200 pt-1">
                    Property of Thakurdwara Coaching Institute • Non-Transferable • Carry daily for class entry
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page Footer */}
      <footer className="text-center text-xs text-slate-500 pt-6 no-print">
        © {new Date().getFullYear()} Thakurdwara Coaching Institute • Official Student ID Card Portal
      </footer>
    </div>
  );
}
