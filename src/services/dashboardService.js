import apiClient from './apiClient';

export const dashboardService = {
  async getSuperAdminDashboard() {
    const res = await apiClient.get('/dashboard/super-admin');
    return res.data.data;
  },

  async getBusinessDashboard() {
    const res = await apiClient.get('/dashboard/business');
    return res.data.data;
  },
};
