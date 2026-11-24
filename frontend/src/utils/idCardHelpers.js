/**
 * Helpers for Student ID Card formatting, validity calculations, and WhatsApp sharing.
 */
import { computeDaysRemaining, parseLocalDate } from './dateCycleUtils';

export function formatDateShort(dateVal) {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }); // e.g. "01 Jan 2026"
  } catch {
    return String(dateVal);
  }
}

export function formatValidityPeriod(validFrom, validTo) {
  const fromStr = formatDateShort(validFrom);
  const toStr = formatDateShort(validTo);

  if (fromStr && toStr) {
    return `Valid: ${fromStr} to ${toStr}`;
  }
  if (toStr) {
    return `Valid until: ${toStr}`;
  }
  if (fromStr) {
    return `Valid from: ${fromStr}`;
  }
  return 'Valid: Active Academic Session';
}

export function formatDemoDates(startDate, endDate) {
  const fromStr = formatDateShort(startDate);
  const toStr = formatDateShort(endDate);

  if (fromStr && toStr) {
    return `${fromStr} to ${toStr}`;
  }
  if (toStr) {
    return `Until ${toStr}`;
  }
  if (fromStr) {
    return `From ${fromStr}`;
  }
  return 'Active Trial';
}

function isActiveEnrollmentItem(item) {
  if (!item) return false;
  const st = (item.status || 'ACTIVE').toUpperCase();
  const acc = (item.access_status || 'ACTIVE').toUpperCase();
  if (st !== 'ACTIVE' || acc !== 'ACTIVE') return false;
  if (item.valid_to) {
    const end = parseLocalDate(item.valid_to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end && end < today) return false;
  }
  return true;
}

export function extractActiveCourses(student, enrollmentData) {
  const courses = [];

  // Check enrollmentData first
  if (enrollmentData) {
    if (enrollmentData.active_green_card && isActiveEnrollmentItem(enrollmentData.active_green_card)) {
      const gc = enrollmentData.active_green_card;
      const computedDays = computeDaysRemaining(gc.valid_to, gc.valid_from);
      courses.push({
        id: gc.id || 'green-card',
        course_name: gc.subject_name || 'Green Card — All Access Annual Pass',
        subject_name: gc.subject_name || 'Green Card',
        teacher_name: gc.teacher_name || null,
        hall_number: gc.hall_number || null,
        schedule: gc.schedule || gc.timing || null,
        timing: gc.timing || gc.schedule || null,
        valid_from: gc.valid_from,
        valid_to: gc.valid_to,
        validity_text: formatValidityPeriod(gc.valid_from, gc.valid_to),
        days_remaining: computedDays !== null ? computedDays : gc.days_remaining,
        admission_number: gc.admission_number,
        item_type: 'GREEN_CARD',
      });
    }

    if (Array.isArray(enrollmentData.active_subjects)) {
      enrollmentData.active_subjects.filter(isActiveEnrollmentItem).forEach((subj) => {
        const computedDays = computeDaysRemaining(subj.valid_to, subj.valid_from);
        courses.push({
          id: subj.id,
          course_name: subj.subject_name,
          subject_name: subj.subject_name,
          teacher_name: subj.teacher_name || null,
          hall_number: subj.hall_number || null,
          schedule: subj.schedule || subj.timing || null,
          timing: subj.timing || subj.schedule || null,
          valid_from: subj.valid_from,
          valid_to: subj.valid_to,
          validity_text: formatValidityPeriod(subj.valid_from, subj.valid_to),
          days_remaining: computedDays !== null ? computedDays : subj.days_remaining,
          admission_number: subj.admission_number,
          item_type: subj.item_type || 'SUBJECT',
        });
      });
    }
  }

  // Fallback to student.active if enrollmentData yielded nothing
  if (courses.length === 0 && student && Array.isArray(student.active)) {
    student.active.filter(isActiveEnrollmentItem).forEach((line) => {
      const computedDays = computeDaysRemaining(line.valid_to, line.valid_from);
      courses.push({
        id: line.id,
        course_name: line.subject_name,
        subject_name: line.subject_name,
        teacher_name: line.teacher_name || null,
        hall_number: line.hall_number || null,
        schedule: line.schedule || line.timing || null,
        timing: line.timing || line.schedule || null,
        valid_from: line.valid_from,
        valid_to: line.valid_to,
        validity_text: formatValidityPeriod(line.valid_from, line.valid_to),
        days_remaining: computedDays !== null ? computedDays : line.days_left,
        admission_number: line.slip_number,
        item_type: line.item_type || 'SUBJECT',
      });
    });
  }

  return courses;
}

export function extractActiveDemos(student, enrollmentData, demos) {
  // If active_demos already pre-filtered on student or enrollmentData
  if (Array.isArray(student?.active_demos) && student.active_demos.length > 0) {
    return student.active_demos;
  }
  if (Array.isArray(enrollmentData?.active_demos) && enrollmentData.active_demos.length > 0) {
    return enrollmentData.active_demos;
  }

  const rawList = demos || student?.demos || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = [];
  const seenRefs = new Set();

  for (const item of rawList) {
    const refNo = item.demo_reference_number || item.reference_number || '';
    if (refNo && seenRefs.has(refNo)) continue;

    const status = (item.status || '').toUpperCase();
    if (['CONVERTED', 'DROPPED', 'EXPIRED'].includes(status)) continue;
    if (item.converted_admission_item_id) continue;

    // Check date
    const endDateVal = item.demo_end_date;
    if (endDateVal) {
      const parts = String(endDateVal).split('T')[0].split('-');
      if (parts.length === 3) {
        const endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        endDate.setHours(23, 59, 59, 999);
        if (endDate < today) continue;
      }
    }

    // Status condition: SCHEDULED, ATTENDED, or enquiry status ACTIVE_DEMO
    const enquiryStatus = (item.enquiry_status || item.enquiry?.status || '').toUpperCase();
    if (!(['SCHEDULED', 'ATTENDED'].includes(status) || enquiryStatus === 'ACTIVE_DEMO')) {
      continue;
    }

    if (refNo) seenRefs.add(refNo);

    let daysRemaining = computeDaysRemaining(item.demo_end_date, item.demo_start_date);
    if (daysRemaining === null) {
      daysRemaining = item.days_remaining;
    }

    active.push({
      id: item.id || refNo,
      demo_reference_number: refNo,
      subject_name: item.subject_name || item.subject_name_snapshot || item.subject || 'Demo Trial',
      teacher_name: item.teacher_name || item.teacher_name_snapshot || null,
      hall_number: item.hall_number || item.hall_number_snapshot || item.hall || null,
      demo_start_date: item.demo_start_date,
      demo_end_date: item.demo_end_date,
      days_remaining: daysRemaining,
      status: item.status || 'SCHEDULED',
    });
  }

  return active;
}

export function buildWhatsAppShareUrl({ student, admissionNo, activeCourses, activeDemos, verifyUrl, instituteName = 'THAKURDWARA COACHING INSTITUTE' }) {
  if (!student?.mobile) return null;

  const rawDigits = student.mobile.replace(/\D/g, '');
  if (!rawDigits) return null;
  // If 10 digits, add 91 India country code
  const phone = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;

  const admNumber = admissionNo || student.latest_admission_number || 'N/A';

  let msg = `🎓 *${instituteName}*\n`;
  msg += `*Official Student Identity Card*\n\n`;
  msg += `*Student Name:* ${student.name}\n`;
  msg += `*Student ID:* ${student.student_code}\n`;
  msg += `*Admission No:* ${admNumber}\n`;
  if (student.father_name) {
    msg += `*Father's Name:* ${student.father_name}\n`;
  }
  msg += `*Mobile:* ${student.mobile}\n\n`;

  msg += `*Enrolled Active Courses & Validity:*\n`;
  if (activeCourses && activeCourses.length > 0) {
    activeCourses.forEach((c, idx) => {
      const period = formatValidityPeriod(c.valid_from, c.valid_to);
      msg += `${idx + 1}. *${c.course_name}*\n   ${period}\n`;
    });
  } else {
    msg += `• No active courses currently.\n`;
  }

  if (activeDemos && activeDemos.length > 0) {
    msg += `\n*Active Trial Demos:*\n`;
    activeDemos.forEach((d, idx) => {
      const period = formatDemoDates(d.demo_start_date, d.demo_end_date);
      msg += `${idx + 1}. *${d.subject_name}* (${d.demo_reference_number})\n   Dates: ${period}${d.teacher_name ? ` | Teacher: ${d.teacher_name}` : ''}${d.hall_number ? ` | Hall: ${d.hall_number}` : ''}\n`;
    });
  }

  if (verifyUrl) {
    msg += `\n*Verify Credential Online:*\n${verifyUrl}\n\n`;
  }

  msg += `_Please keep this official card for attendance & campus access._`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
