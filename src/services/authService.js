import apiClient, { getInMemoryRefreshToken } from './apiClient';

export const authService = {
  async getBootstrapStatus() {
    const res = await apiClient.get('/auth/bootstrap-status');
    return res.data.data;
  },

  async claimSuperAdmin(payload) {
    const res = await apiClient.post('/auth/claim-super-admin', payload);
    return res.data.data;
  },

  async register(payload) {
    const res = await apiClient.post('/auth/register', payload);
    return res.data.data;
  },

  async login(payload) {
    const res = await apiClient.post('/auth/login', payload);
    return res.data.data;
  },

  async logout() {
    const refreshToken = getInMemoryRefreshToken();
    await apiClient.post('/auth/logout', { refreshToken });
  },

  async getCurrentUser() {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },
};
