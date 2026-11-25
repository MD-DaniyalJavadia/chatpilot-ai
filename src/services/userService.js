import apiClient from './apiClient';

export const userService = {
  async listUsers({ search = '', role = '', page = 1, pageSize = 10 } = {}) {
    const res = await apiClient.get('/users', {
      params: { search, role, page, pageSize },
    });
    return res.data.data;
  },

  async updateUserStatus(userId, isActive) {
    const res = await apiClient.patch(`/users/${userId}/status`, { isActive });
    return res.data;
  },

  async updateOwnProfile(payload) {
    const res = await apiClient.put('/users/me/profile', payload);
    return res.data.data;
  },

  async updateOwnPassword(payload) {
    const res = await apiClient.put('/users/me/password', payload);
    return res.data;
  },

  async listAuditLogs({ page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/users/audit-logs', {
      params: { page, pageSize },
    });
    return res.data.data;
  },
};
