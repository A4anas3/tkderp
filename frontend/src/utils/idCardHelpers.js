/**
 * Helpers for Student ID Card formatting, validity calculations, and WhatsApp sharing.
 */

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

export function extractActiveCourses(student, enrollmentData) {
  const courses = [];

  // Check enrollmentData first
  if (enrollmentData) {
    if (enrollmentData.active_green_card) {
      const gc = enrollmentData.active_green_card;
      courses.push({
        id: gc.id || 'green-card',
        course_name: gc.subject_name || 'Green Card — All Access Annual Pass',
        subject_name: gc.subject_name || 'Green Card',
        teacher_name: gc.teacher_name || null,
        
        hall_number: gc.hall_number || null,
        valid_from: gc.valid_from,
        valid_to: gc.valid_to,
        validity_text: formatValidityPeriod(gc.valid_from, gc.valid_to),
        days_remaining: gc.days_remaining,
        admission_number: gc.admission_number,
        item_type: 'GREEN_CARD',
      });
    }

    if (Array.isArray(enrollmentData.active_subjects)) {
      enrollmentData.active_subjects.forEach((subj) => {
        courses.push({
          id: subj.id,
          course_name: subj.subject_name,
          subject_name: subj.subject_name,
          teacher_name: subj.teacher_name,
          hall_number: subj.hall_number,
          valid_from: subj.valid_from,
          valid_to: subj.valid_to,
          validity_text: formatValidityPeriod(subj.valid_from, subj.valid_to),
          days_remaining: subj.days_remaining,
          admission_number: subj.admission_number,
          item_type: subj.item_type || 'SUBJECT',
        });
      });
    }
  }

  // Fallback to student.active if enrollmentData yielded nothing
  if (courses.length === 0 && student && Array.isArray(student.active)) {
    student.active.forEach((line) => {
      courses.push({
        id: line.id,
        course_name: line.subject_name,
        subject_name: line.subject_name,
        teacher_name: line.teacher_name,
        hall_number: line.hall_number,
        valid_from: line.valid_from,
        valid_to: line.valid_to,
        validity_text: formatValidityPeriod(line.valid_from, line.valid_to),
        days_remaining: line.days_left,
        admission_number: line.slip_number,
        item_type: line.item_type || 'SUBJECT',
      });
    });
  }

  return courses;
}

export function buildWhatsAppShareUrl({ student, admissionNo, activeCourses, verifyUrl }) {
  if (!student?.mobile) return null;

  const rawDigits = student.mobile.replace(/\D/g, '');
  if (!rawDigits) return null;
  // If 10 digits, add 91 India country code
  const phone = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;

  const admNumber = admissionNo || student.latest_admission_number || 'N/A';

  let msg = `🎓 *THAKURDWARA COACHING INSTITUTE*\n`;
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

  if (verifyUrl) {
    msg += `\n*Verify Credential Online:*\n${verifyUrl}\n\n`;
  }

  msg += `_Please keep this official card for attendance & campus access._`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
