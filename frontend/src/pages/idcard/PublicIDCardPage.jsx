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
import { formatDemoDates } from '../../utils/idCardHelpers';
import { computeDaysRemaining } from '../../utils/dateCycleUtils';
import { useInstitute } from '../../context/InstituteContext';
import InstituteLogo from '../../components/common/InstituteLogo';
import VerifiedStamp from '../../components/common/VerifiedStamp';

export default function PublicIDCardPage() {
  const { institute } = useInstitute();
  const { identifier: pathIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Route prefix (e.g. /verify or /id-card)
  const isVerifyRoute = location.pathname.startsWith('/verify');
  const basePath = isVerifyRoute ? '/verify' : '/id-card';

  // Identifier can come from route params or query params (?admission_no=... or ?identifier=...)
  const queryParamIdent =
    searchParams.get('admission_no') ||
    searchParams.get('student_id') ||
    searchParams.get('phone') ||
    searchParams.get('mobile') ||
    searchParams.get('identifier') ||
    '';
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
                'Unable to retrieve student ID card. Please verify your Student ID, Phone Number, or Admission Number.'
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
  const qrCodeIdent = cardData?.student?.student_code || cardData?.student?.admission_number || '';
  const qrTargetUrl = qrCodeIdent
    ? `${origin}/id-card/${encodeURIComponent(qrCodeIdent)}`
    : '';

  const instituteName =
    cardData?.institute_name || institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';
  const instituteLogoUrl =
    cardData?.institute_logo_url || institute?.logo_url || null;
  const instituteTagline =
    cardData?.institute_tagline ||
    (institute?.address
      ? `${institute.address}${institute?.phone ? ` • ${institute.phone}` : ''}`
      : 'Civil Lines, Thakurdwara (U.P.)');

  const dueBalance = Number(cardData?.due_balance ?? cardData?.student?.due_balance);
  const hasDueBalance = Number.isFinite(dueBalance) && dueBalance > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-black font-sans py-6 px-3 sm:px-6 flex flex-col justify-between print:block print:min-h-0 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto w-full space-y-5 print:max-w-none print:space-y-0">
        {/* Top Institute Header Banner (no-print) */}
        <div className="bg-white border-2 border-black rounded-xl p-4 sm:p-5 shadow-xs text-center relative overflow-hidden no-print">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-lg bg-white border border-slate-300 flex items-center justify-center overflow-hidden shrink-0 p-0.5">
              <InstituteLogo
                src={instituteLogoUrl}
                alt={instituteName}
                className="w-full h-full object-contain"
                fallback={<ShieldCheck className="w-6 h-6 text-odoo-800 shrink-0" />}
              />
            </div>
            <h1 className="text-base sm:text-xl font-black text-black tracking-wide uppercase">
              {instituteName}
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
              Enter Student ID, Phone Number, or Admission Number
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Enter Student ID, Phone Number, or Admission Number..."
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
              Enter your Student ID (e.g. STU20260001), Registered Phone Number (e.g. 9838011221), or Admission Number (e.g. ADM-2026-0001) to view the student identity card.
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
            <h2 className="text-sm font-bold text-black">Enter Student ID or Registered Phone Number</h2>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Please enter your Student ID (e.g. <span className="font-mono font-bold text-black">STU20260001</span>), Registered Phone Number (e.g. <span className="font-mono font-bold text-black">9838011221</span>), or Admission Number in the search box above and click{' '}
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
                No matching student or admission record found for{' '}
                <span className="font-mono font-bold text-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">{currentIdentifier}</span>. Please verify your Student ID, Phone Number, or Admission Number and try again.
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

        {/* ACTIVE UPDATED ID CARD SECTION (ONLY when active subjects or demos exist) */}
        {!loading && cardData && cardData.student && (cardData.active_courses?.length > 0 || cardData.active_demos?.length > 0) && (
          <div className="space-y-4 print:space-y-0">
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
            <div className="printable-id-card-wrapper py-2 flex justify-center print:block print:py-0">
              <div
                id="printable-id-card"
                className="printable-id-card w-full max-w-[440px] bg-white border-2 border-black rounded-xl overflow-hidden shadow-md text-black print:overflow-visible print:shadow-none"
              >
                {/* Card Header: Institute Emblem & Details */}
                <div className="bg-slate-900 text-white px-4 py-3.5 relative border-b-2 border-amber-500 print:rounded-t-[10px] print:py-3 id-card-keep-together">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-white border border-amber-400/80 flex items-center justify-center overflow-hidden shrink-0 p-0.5 shadow-2xs">
                      <InstituteLogo
                        src={instituteLogoUrl}
                        alt={instituteName}
                        className="w-full h-full object-contain"
                        fallback={<ShieldCheck className="w-6 h-6 text-slate-900 shrink-0" />}
                      />
                    </div>
                    <div className="text-left min-w-0">
                      <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white leading-tight">
                        {instituteName}
                      </h1>
                      <p className="text-[10px] sm:text-[11px] text-slate-200 font-medium tracking-tight mt-0.5">
                        {instituteTagline}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="bg-amber-400 text-slate-950 font-black text-[10px] tracking-widest uppercase px-3 py-0.5 rounded-full shadow-2xs inline-block">
                      STUDENT IDENTITY CARD
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3.5 bg-white print:p-3 print:space-y-2.5">
                  {/* Student Identification Row: Photo + Primary Metadata */}
                  <div className="flex items-start gap-3.5 border-b border-slate-200 pb-3 print:pb-2.5 id-card-keep-together">
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
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1 id-card-section-heading">
                      <span className="text-[11px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-odoo-800 shrink-0" />
                        Enrolled Active Courses ({cardData.active_courses?.length || 0})
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Active & Valid
                      </span>
                    </div>

                    {!cardData.active_courses || cardData.active_courses.length === 0 ? (
                      <div className="p-2.5 rounded border border-dashed border-slate-300 bg-slate-50 text-center">
                        <p className="text-xs font-semibold text-slate-700">
                          No active courses currently enrolled.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5 print:max-h-none print:overflow-visible print:pr-0 print:space-y-1.5 id-card-scroll-list">
                        {cardData.active_courses
                          .filter((c) => !['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes((c.status || 'ACTIVE').toUpperCase()))
                          .map((course, idx) => {
                            const daysRem = computeDaysRemaining(course.valid_to, course.valid_from) ?? course.days_remaining;
                            return (
                          <div
                            key={idx}
                            className="p-2 bg-slate-50 rounded-lg border border-slate-300 text-xs space-y-1 print:p-1.5 id-card-keep-together"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="font-bold text-black leading-tight flex-1">
                                {course.course_name}
                              </span>

                            </div>

                            {/* Class Timing, Hall Number & Teacher Name */}
                            {((course.schedule || course.timing) || course.hall_number || course.teacher_name) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700 font-medium">
                                {(course.schedule || course.timing) && (
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                    <span>Timing: <strong className="text-black">{course.schedule || course.timing}</strong></span>
                                  </div>
                                )}
                                {course.hall_number && (
                                  <span>
                                    Hall: <strong className="text-black">{course.hall_number}</strong>
                                  </span>
                                )}
                                {course.teacher_name && (
                                  <span>
                                    Teacher: <strong className="text-black">{course.teacher_name}</strong>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Validity Period */}
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5 border-t border-slate-200">
                              <span className="font-bold text-odoo-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-odoo-700 shrink-0" />
                                {course.validity_period}
                              </span>

                              {daysRem !== null && daysRem !== undefined && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    daysRem <= 5
                                      ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                  }`}
                                >
                                  {daysRem}d remaining
                                </span>
                              )}
                            </div>
                          </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Active Demos Section (Hidden completely if no active demos) */}
                  {cardData.active_demos && cardData.active_demos.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="flex items-center justify-between border-b border-amber-300 pb-1 id-card-section-heading">
                        <span className="text-[11px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          Active Trial Demos ({cardData.active_demos.length})
                        </span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-300">
                          Demo Trial
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-0.5 print:max-h-none print:overflow-visible print:pr-0 print:space-y-1.5 id-card-scroll-list">
                        {cardData.active_demos.map((demo, idx) => (
                          <div
                            key={demo.demo_reference_number || idx}
                            className="p-2 bg-amber-50/50 rounded-lg border border-amber-200 text-xs space-y-1 print:p-1.5 id-card-keep-together"
                          >
                            {/* Subject & Demo Reference Number */}
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="font-bold text-black leading-tight flex-1">
                                {demo.subject_name}
                              </span>
                              <span className="font-mono text-[10px] font-black text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                                {demo.demo_reference_number}
                              </span>
                            </div>

                            {/* Teacher & Hall */}
                            {(demo.teacher_name || demo.hall_number) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700 font-medium">
                                {demo.teacher_name && (
                                  <span>
                                    Teacher: <strong className="text-black">{demo.teacher_name}</strong>
                                  </span>
                                )}
                                {demo.hall_number && (
                                  <span>
                                    Hall: <strong className="text-black">{demo.hall_number}</strong>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Demo Dates & Days Remaining */}
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5 border-t border-amber-200/60">
                              <span className="font-bold text-amber-950 bg-white px-2 py-0.5 rounded border border-amber-300 inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-amber-700 shrink-0" />
                                Demo: {formatDemoDates(demo.demo_start_date, demo.demo_end_date)}
                              </span>

                              {demo.days_remaining !== null && demo.days_remaining !== undefined && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                  {demo.days_remaining}d left
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3.5 print:space-y-2 id-card-keep-together">
                    {/* Live Due Balance (only shown when due > 0) */}
                    {hasDueBalance && (
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 flex items-center justify-between">
                        <span>Account Dues:</span>
                        <span className="font-mono font-semibold text-slate-700">
                          Due Balance: ₹{dueBalance.toFixed(2)}
                        </span>
                      </div>
                    )}

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
                            /id-card/{qrCodeIdent}
                          </p>
                        </div>
                      </div>

                      {/* Signatory & Seal */}
                      <div className="flex flex-col items-end text-right space-y-1 shrink-0">
                        <div className="w-24 border-b border-black inline-block pb-0.5">
                          <span className="font-serif italic text-[11px] text-slate-700">Auth Sign</span>
                        </div>
                        <p className="text-[9px] font-black uppercase text-black tracking-wider">
                          Authorized Signatory
                        </p>
                        <VerifiedStamp instituteName={instituteName} />
                      </div>
                    </div>

                    {/* Bottom Instructions Notice */}
                    <div className="text-[8px] sm:text-[9px] text-center text-slate-600 border-t border-slate-200 pt-1">
                      Property of {instituteName} • Non-Transferable • Carry daily for class entry
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page Footer */}
      <footer className="text-center text-xs text-slate-500 pt-6 no-print">
        © {new Date().getFullYear()} {instituteName} • Official Student ID Card Portal
      </footer>
    </div>
  );
}
