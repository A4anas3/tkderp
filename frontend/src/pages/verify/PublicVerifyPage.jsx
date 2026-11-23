import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  BookOpen,
  User,
  Search,
  Printer,
  ExternalLink,
  Phone,
  MapPin,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import axios from 'axios';
import { formatValidityPeriod } from '../../utils/idCardHelpers';

export default function PublicVerifyPage() {
  const { identifier } = useParams();
  const navigate = useNavigate();

  const [inputVal, setInputVal] = useState(identifier || '');
  const [loading, setLoading] = useState(Boolean(identifier));
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!identifier) {
      setLoading(false);
      setData(null);
      setErrorMsg('');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg('');

    axios
      .get(`/api/verify/${encodeURIComponent(identifier.trim())}`)
      .then((res) => {
        if (isMounted) {
          setData(res.data);
          setErrorMsg('');
        }
      })
      .catch((err) => {
        if (isMounted) {
          const msg =
            err.response?.data?.detail ||
            err.message ||
            'Verification failed. Record could not be retrieved.';
          setErrorMsg(msg);
          setData(null);
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
  }, [identifier]);

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (inputVal.trim()) {
      navigate(`/verify/${encodeURIComponent(inputVal.trim())}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatTimestamp = (ts) => {
    if (!ts) return new Date().toLocaleString('en-IN');
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black font-sans py-6 px-3 sm:px-6 flex flex-col justify-between">
      <div className="max-w-2xl mx-auto w-full space-y-5">
        {/* Navigation Link Back to ERP & Public ID Card */}
        <div className="flex items-center justify-between no-print">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-black transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to ERP Dashboard
          </Link>
          <Link
            to={identifier ? `/id-card/${encodeURIComponent(identifier)}` : '/id-card'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-odoo-700 hover:text-odoo-900 transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Get Student ID Card
          </Link>
        </div>

        {/* Top Institute Header */}
        <div className="bg-white border-2 border-black rounded-xl p-4 sm:p-5 shadow-xs text-center relative overflow-hidden">
          <div className="flex items-center justify-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-odoo-800 shrink-0" />
            <h1 className="text-base sm:text-xl font-black text-black tracking-wide uppercase">
              THAKURDWARA COACHING INSTITUTE
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">
            Official Credential & Student ID Verification Portal
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600 mt-2">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              Civil Lines, Thakurdwara (U.P.)
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              +91 98765 43210
            </span>
          </div>
        </div>

        {/* Search Bar if needed / No Identifier Provided */}
        <div className="bg-white border border-slate-300 rounded-xl p-3 sm:p-4 shadow-2xs no-print">
          <form onSubmit={handleManualSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Enter Admission Number or Student ID..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-odoo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-odoo-700 hover:bg-odoo-800 text-white rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 shrink-0"
            >
              Verify Credential
            </button>
          </form>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-10 h-10 border-4 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-sm font-bold text-black">Verifying Credential with Records...</h2>
            <p className="text-xs text-slate-600 font-mono">Querying ID: {identifier}</p>
          </div>
        )}

        {/* Error State */}
        {!loading && errorMsg && (
          <div className="bg-white border-2 border-rose-400 rounded-xl p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-black text-rose-900 uppercase">
                Verification Unsuccessful
              </h2>
              <p className="text-xs text-rose-800 mt-1 max-w-md mx-auto">{errorMsg}</p>
            </div>
            <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 inline-block font-mono">
              Identifier: {identifier}
            </div>
          </div>
        )}

        {/* Verified Certificate Card */}
        {!loading && data && data.verified && (
          <div
            id="printable-verification"
            className="bg-white border-2 border-black rounded-xl p-5 sm:p-6 shadow-md space-y-5"
          >
            {/* Prominent VERIFIED Badge Banner */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-3.5 sm:p-4 text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <span className="text-base sm:text-lg font-black tracking-wider uppercase">
                  VERIFIED OFFICIAL CREDENTIAL
                </span>
              </div>
              <p className="text-xs text-emerald-900 font-semibold">
                Genuine Student Record Authenticated by Thakurdwara Coaching Institute
              </p>
            </div>

            {/* Student Information Section */}
            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                {/* Photo or Avatar */}
                <div className="w-24 h-28 sm:w-28 sm:h-32 border-2 border-black rounded-lg overflow-hidden bg-white shrink-0 shadow-xs flex items-center justify-center">
                  {data.student.photo_url ? (
                    <img
                      src={data.student.photo_url}
                      alt={data.student.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-700 p-2 text-center h-full">
                      <User className="w-10 h-10 text-slate-400 mb-1" />
                      <span className="text-[10px] font-bold uppercase leading-tight text-black">
                        {data.student.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Details Grid */}
                <div className="flex-1 w-full text-center sm:text-left space-y-1.5 text-xs">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-black uppercase leading-tight">
                      {data.student.name}
                    </h2>
                    {data.student.father_name && (
                      <p className="text-xs text-zinc-950 font-semibold">
                        Father's Name: {data.student.father_name}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-600 uppercase block">
                        Admission Number
                      </span>
                      <span className="font-mono text-sm font-black text-black">
                        {data.student.admission_number}
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-600 uppercase block">
                        Student ID Code
                      </span>
                      <span className="font-mono text-sm font-black text-black">
                        {data.student.student_code}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-700">Account Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        data.student.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-rose-100 text-rose-900 border border-rose-300'
                      }`}
                    >
                      ● {data.student.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Enrolled Active Courses Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-odoo-800 shrink-0" />
                  Enrolled Active Courses & Validity ({data.active_courses?.length || 0})
                </span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300">
                  Active Enrolled
                </span>
              </div>

              {!data.active_courses || data.active_courses.length === 0 ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-center space-y-1">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto" />
                  <p className="text-xs font-bold text-amber-900">
                    No active enrolled courses currently.
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Course period may have concluded or is awaiting session renewal.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.active_courses.map((course, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-lg border-2 border-slate-300 space-y-1.5 text-xs shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-sm font-black text-black">
                          {course.course_name}
                        </span>

                      </div>

                      {/* Course Details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-700 font-medium">
                        {course.teacher_name && (
                          <span>Faculty: <strong className="text-black">{course.teacher_name}</strong></span>
                        )}
                        {course.hall_number && (
                          <span>Hall: <strong className="text-black">{course.hall_number}</strong></span>
                        )}
                        {course.admission_number && (
                          <span>Ref: <strong className="font-mono text-black">{course.admission_number}</strong></span>
                        )}
                      </div>

                      {/* Prominent Validity Period */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="font-bold text-odoo-900 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200 inline-flex items-center gap-1.5 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-odoo-700 shrink-0" />
                          {course.validity_period}
                        </span>

                        {course.days_remaining !== null && course.days_remaining !== undefined && (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              course.days_remaining <= 5
                                ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}
                          >
                            {course.days_remaining} days remaining
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Metadata & Official Seal Footer */}
            <div className="pt-3 border-t-2 border-black flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="space-y-0.5 text-center sm:text-left text-[11px]">
                <p className="flex items-center justify-center sm:justify-start gap-1 font-semibold text-black">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Verified on: {formatTimestamp(data.verified_at)}
                </p>
                <p className="text-slate-500">
                  System Reference ID: <span className="font-mono">{data.student.admission_number}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 no-print">
                <Link
                  to={`/id-card/${encodeURIComponent(data.student.admission_number || identifier)}`}
                  className="px-3 py-1.5 rounded-lg bg-odoo-700 hover:bg-odoo-800 text-white font-bold text-xs inline-flex items-center gap-1.5 transition shadow-2xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  View ID Card
                </Link>
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-black font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Verification
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 pt-6 no-print">
        © {new Date().getFullYear()} Thakurdwara Coaching Institute • Official Student Verification Portal
      </footer>
    </div>
  );
}
