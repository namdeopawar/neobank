import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || '/api/v1';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

export const accountApi = {
  getCustomerAccounts: (customerId: string) => api.get(`/accounts/customer/${customerId}`),
  getAccount: (id: string) => api.get(`/accounts/${id}`),
  getBalance: (id: string) => api.get(`/accounts/${id}/balance`),
  createAccount: (data: any) => api.post('/accounts', data),
  freezeAccount: (id: string) => api.post(`/accounts/${id}/freeze`),
};

export const transactionApi = {
  getAccountTransactions: (accountId: string, params?: any) =>
    api.get(`/transactions/account/${accountId}`, { params }),
  createTransaction: (data: any) => api.post('/transactions', data),
  transfer: (data: any) => api.post('/transactions/transfer', data),
  getTransaction: (id: string) => api.get(`/transactions/${id}`),
};

export default api;
