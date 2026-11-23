import api from './api';

export const authApi = {
  login: async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

export const dashboardApi = {
  getAdmin: async () => {
    const res = await api.get('/dashboard/admin');
    return res.data;
  },
  getCashier: async () => {
    const res = await api.get('/dashboard/cashier');
    return res.data;
  },
  getTeacher: async () => {
    const res = await api.get('/dashboard/teacher');
    return res.data;
  },
};

export const teacherApi = {
  list: async (params) => {
    const res = await api.get('/teachers', { params });
    return res.data;
  },
  getAll: async () => {
    const res = await api.get('/teachers/all');
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/teachers/${id}`);
    return res.data;
  },
  getByMobile: async (mobile) => {
    const res = await api.get(`/teachers/by-mobile/${encodeURIComponent(mobile)}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/teachers', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/teachers/${id}`, data);
    return res.data;
  },
  updateStatus: async (id, status, reason = null) => {
    const res = await api.patch(`/teachers/${id}/status`, { status, reason });
    return res.data;
  },
  getRoster: async (id, params) => {
    const res = await api.get(`/teachers/${id}/roster`, { params });
    return res.data;
  },
  getBreakup: async (id) => {
    const res = await api.get(`/teachers/${id}/breakup`);
    return res.data;
  },
  getHistory: async (id, params) => {
    const res = await api.get(`/teachers/${id}/history`, { params });
    return res.data;
  },
  getCollections: async (id) => {
    const res = await api.get(`/teachers/${id}/collections`);
    return res.data;
  },
  getAttendanceSummary: async (params) => {
    const res = await api.get('/teachers/attendance', { params });
    return res.data;
  },
  getTeacherAttendance: async (id, params) => {
    const res = await api.get(`/teachers/${id}/attendance`, { params });
    return res.data;
  },
  toggleAttendance: async (id, data) => {
    const res = await api.post(`/teachers/${id}/attendance/toggle`, data);
    return res.data;
  },
  saveMonthlyAttendance: async (id, data) => {
    const res = await api.post(`/teachers/${id}/attendance`, data);
    return res.data;
  },
  uploadPhoto: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/teachers/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  uploadStandalonePhoto: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/teachers/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export const studentApi = {
  list: async (params) => {
    const res = await api.get('/students', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/students/${id}`);
    return res.data;
  },
  checkMobile: async (mobile) => {
    const res = await api.get(`/students/check-mobile/${encodeURIComponent(mobile)}`);
    return res.data;
  },
  create: async (data, params = {}) => {
    const res = await api.post('/students', data, { params });
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/students/${id}`, data);
    return res.data;
  },
  revoke: async (id, reason) => {
    const res = await api.post(`/students/${id}/revoke`, { reason });
    return res.data;
  },
  restore: async (id) => {
    const res = await api.post(`/students/${id}/restore`);
    return res.data;
  },
  getAudit: async (id, params) => {
    const res = await api.get(`/audit/student/${id}`, { params });
    return res.data;
  },
  uploadPhoto: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/students/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  uploadStandalonePhoto: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/students/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  getLastFeePeriod: async (studentId, subjectId) => {
    const res = await api.get(`/students/${studentId}/last-fee-period`, {
      params: { subject_id: subjectId },
    });
    return res.data;
  },
  getActiveEnrollment: async (studentId) => {
    const res = await api.get(`/students/${studentId}/active-enrollment`);
    return res.data;
  },
};

export const enquiryApi = {
  list: async (params) => {
    const res = await api.get('/enquiries', { params });
    return res.data;
  },
  listDemos: async (params) => {
    const res = await api.get('/enquiries/demos', { params });
    return res.data;
  },
  getAnalytics: async (params) => {
    const res = await api.get('/enquiries/analytics', { params });
    return res.data;
  },
  updateDemoStatus: async (demoItemId, data) => {
    const res = await api.put(`/enquiries/demos/${demoItemId}/status`, data);
    return res.data;
  },
  getSummary: async () => {
    const res = await api.get('/enquiries/summary');
    return res.data;
  },
  getUpcomingDeadlines: async () => {
    const res = await api.get('/enquiries/upcoming-deadlines');
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/enquiries/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/enquiries', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/enquiries/${id}`, data);
    return res.data;
  },
  convert: async (id) => {
    const res = await api.post(`/enquiries/${id}/convert`);
    return res.data;
  },
};

export const subjectApi = {
  list: async (params) => {
    const res = await api.get('/subjects', { params });
    return res.data;
  },
  getAll: async () => {
    const res = await api.get('/subjects/all');
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/subjects/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/subjects', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/subjects/${id}`, data);
    return res.data;
  },
};

export const greenCardApi = {
  list: async () => {
    const res = await api.get('/green-card');
    return res.data;
  },
  getActive: async () => {
    const res = await api.get('/green-card/active');
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/green-card', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/green-card/${id}`, data);
    return res.data;
  },
};

export const admissionApi = {
  preview: async (payload) => {
    const res = await api.post('/admissions/preview', payload);
    return res.data;
  },
  list: async (params) => {
    const res = await api.get('/admissions', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/admissions/${id}`);
    return res.data;
  },
  create: async (payload) => {
    const res = await api.post('/admissions', payload);
    return res.data;
  },
  cancel: async (id) => {
    const res = await api.post(`/admissions/${id}/cancel`);
    return res.data;
  },
  revoke: async (id, data) => {
    const res = await api.post(`/admissions/${id}/revoke`, data);
    return res.data;
  },
  restore: async (id) => {
    const res = await api.post(`/admissions/${id}/restore`);
    return res.data;
  },
  waiveDue: async (id, data) => {
    const res = await api.post(`/admissions/${id}/waive`, data);
    return res.data;
  },
  getSlips: async (id) => {
    const res = await api.get(`/admissions/${id}/slips`);
    return res.data;
  },
  updateValidity: async (id, data) => {
    const res = await api.patch(`/admissions/${id}/validity`, data);
    return res.data;
  },
  suspend: async (id, data) => {
    const res = await api.post(`/admissions/${id}/suspend`, data);
    return res.data;
  },
  resume: async (id) => {
    const res = await api.post(`/admissions/${id}/resume`);
    return res.data;
  },
  discontinue: async (id, data) => {
    const res = await api.post(`/admissions/${id}/discontinue`, data);
    return res.data;
  },
  updateItemValidity: async (itemId, data) => {
    const res = await api.patch(`/admissions/items/${itemId}/validity`, data);
    return res.data;
  },
  suspendItem: async (itemId, data) => {
    const res = await api.post(`/admissions/items/${itemId}/suspend`, data);
    return res.data;
  },
  resumeItem: async (itemId) => {
    const res = await api.post(`/admissions/items/${itemId}/resume`);
    return res.data;
  },
  discontinueItem: async (itemId, data) => {
    const res = await api.post(`/admissions/items/${itemId}/discontinue`, data);
    return res.data;
  },
  renewSubject: async (payload) => {
    const res = await api.post('/admissions/renew-subject', payload);
    return res.data;
  },
  calculateRenewal: async (payload) => {
    const res = await api.post('/admissions/calculate-renewal', payload);
    return res.data;
  },
  changeSubject: async (payload) => {
    const res = await api.post('/admissions/change-subject', payload);
    return res.data;
  },
};

export const paymentApi = {
  list: async (params) => {
    const res = await api.get('/payments', { params });
    return res.data;
  },
  listTransactions: async (params) => {
    const res = await api.get('/payments/transactions', { params });
    return res.data;
  },
  create: async (payload) => {
    const res = await api.post('/payments', payload);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/payments/${id}`, data);
    return res.data;
  },
  refund: async (data) => {
    const res = await api.post('/payments/refund', data);
    return res.data;
  },
  listRefunds: async (params) => {
    const res = await api.get('/payments/refunds', { params });
    return res.data;
  },
  getReceipt: async (id) => {
    const res = await api.get(`/payments/${id}/receipt`);
    return res.data;
  },
  getRefundReceipt: async (id) => {
    const res = await api.get(`/payments/refunds/${id}/receipt`);
    return res.data;
  },
};

export const expenseApi = {
  listCategories: async () => {
    const res = await api.get('/expenses/categories');
    return res.data;
  },
  createCategory: async (data) => {
    const res = await api.post('/expenses/categories', data);
    return res.data;
  },
  listExpenses: async (params) => {
    const res = await api.get('/expenses', { params });
    return res.data;
  },
  createExpense: async (data) => {
    const res = await api.post('/expenses', data);
    return res.data;
  },
  listSalaries: async (params) => {
    const res = await api.get('/expenses/salaries', { params });
    return res.data;
  },
  createSalary: async (data) => {
    const res = await api.post('/expenses/salaries', data);
    return res.data;
  },
  paySalary: async (recordId, data) => {
    const res = await api.post(`/expenses/salaries/${recordId}/pay`, data);
    return res.data;
  },
};

export const reportApi = {
  getCollections: async (params) => {
    const res = await api.get('/reports/collections', { params });
    return res.data;
  },
  getDuesAgeing: async (params) => {
    const res = await api.get('/reports/dues-ageing', { params });
    return res.data;
  },
  getSubjectBreakup: async (params) => {
    const res = await api.get('/reports/subject-breakup', { params });
    return res.data;
  },
  getTeacherBreakup: async (params) => {
    const res = await api.get('/reports/teacher-breakup', { params });
    return res.data;
  },
  getAdmissionsConversion: async (params) => {
    const res = await api.get('/reports/admissions-conversion', { params });
    return res.data;
  },
  getWaivers: async (params) => {
    const res = await api.get('/reports/waivers', { params });
    return res.data;
  },
  getRefunds: async (params) => {
    const res = await api.get('/reports/refunds', { params });
    return res.data;
  },
  getExpenses: async (params) => {
    const res = await api.get('/reports/expenses', { params });
    return res.data;
  },
  getSummaryDashboard: async (params) => {
    const res = await api.get('/reports/summary-dashboard', { params });
    return res.data;
  },
  // Legacy / detail aliases
  getSubjectRevenue: async (params) => {
    const res = await api.get('/reports/subject-revenue', { params });
    return res.data;
  },
  getTeacherRevenue: async (params) => {
    const res = await api.get('/reports/teacher-revenue', { params });
    return res.data;
  },
  getCashMovement: async (params = 2026) => {
    const queryParams = typeof params === 'object' ? params : { year: params };
    const res = await api.get('/reports/cash-movement', { params: queryParams });
    return res.data;
  },
};

export const userApi = {
  list: async (params) => {
    const res = await api.get('/users', { params });
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/users', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/users/${id}`, data);
    return res.data;
  },
  resetPassword: async (id, newPassword) => {
    const res = await api.post(`/users/${id}/reset-password`, { new_password: newPassword });
    return res.data;
  },
};

export const assessmentApi = {
  list: async (params) => {
    const res = await api.get('/assessments', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/assessments/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/assessments', data);
    return res.data;
  },
  recordMarks: async (id, data) => {
    const res = await api.post(`/assessments/${id}/marks`, data);
    return res.data;
  },
  getStudentHistory: async (studentId) => {
    const res = await api.get(`/assessments/students/${studentId}/history`);
    return res.data;
  },
};

export const auditApi = {
  list: async (params) => {
    const res = await api.get('/audit', { params });
    return res.data;
  },
  getStudentAudit: async (studentId, params) => {
    const res = await api.get(`/audit/student/${studentId}`, { params });
    return res.data;
  },
  getActions: async () => {
    const res = await api.get('/audit/actions');
    return res.data;
  },
  getEntityTypes: async () => {
    const res = await api.get('/audit/entity-types');
    return res.data;
  },
  getUsers: async () => {
    const res = await api.get('/audit/users');
    return res.data;
  },
  getStats: async () => {
    const res = await api.get('/audit/stats');
    return res.data;
  },
};

export const verificationApi = {
  verify: async (identifier) => {
    const res = await api.get(`/verify/${encodeURIComponent(identifier)}`);
    return res.data;
  },
};

export const remindersApi = {
  getQueue: async (params) => {
    const res = await api.get('/reminders/queue', { params });
    return res.data;
  },
  generate: async () => {
    const res = await api.post('/reminders/generate');
    return res.data;
  },
  markSent: async (id) => {
    const res = await api.post(`/reminders/${id}/mark-sent`);
    return res.data;
  },
  markFailed: async (id, reason) => {
    const res = await api.post(`/reminders/${id}/mark-failed`, { reason });
    return res.data;
  },
  resetPending: async (id) => {
    const res = await api.post(`/reminders/${id}/reset-pending`);
    return res.data;
  },
  sendStudentReminder: async (studentId) => {
    const res = await api.post(`/reminders/student/${studentId}/send-due-reminder`);
    return res.data;
  },
  sendSubjectReminders: async (subjectId) => {
    const res = await api.post(`/reminders/subject/${subjectId}/send-due-reminders`);
    return res.data;
  },
};

export const renewalsApi = {
  getSummary: async (params) => {
    const res = await api.get('/renewals', { params });
    return res.data;
  },
};


