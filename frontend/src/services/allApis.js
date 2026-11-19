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
  get: async (id) => {
    const res = await api.get(`/teachers/${id}`);
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
  create: async (data) => {
    const res = await api.post('/students', data);
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
};

export const enquiryApi = {
  list: async (params) => {
    const res = await api.get('/enquiries', { params });
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

export const batchApi = {
  list: async (params) => {
    const res = await api.get('/batches', { params });
    return res.data;
  },
  getAll: async () => {
    const res = await api.get('/batches/all');
    return res.data;
  },
  get: async (id) => {
    const res = await api.get(`/batches/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/batches', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/batches/${id}`, data);
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
};

export const paymentApi = {
  list: async (params) => {
    const res = await api.get('/payments', { params });
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
  getSubjectRevenue: async (params) => {
    const res = await api.get('/reports/subject-revenue', { params });
    return res.data;
  },
  getBatchRevenue: async (params) => {
    const res = await api.get('/reports/batch-revenue', { params });
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
