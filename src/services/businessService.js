import apiClient from './apiClient';

export const businessService = {
  async listBusinesses({ search = '', status = '', page = 1, pageSize = 10 } = {}) {
    const res = await apiClient.get('/businesses', {
      params: { search, status, page, pageSize },
    });
    return res.data.data;
  },

  async updateBusinessStatus(businessId, status) {
    const res = await apiClient.patch(`/businesses/${businessId}/status`, { status });
    return res.data;
  },

  async getCurrentProfile() {
    const res = await apiClient.get('/businesses/current/profile');
    return res.data.data;
  },

  async updateCurrentProfile(payload) {
    const res = await apiClient.put('/businesses/current/profile', payload);
    return res.data.data;
  },

  async listTeamMembers() {
    const res = await apiClient.get('/businesses/current/team');
    return res.data.data;
  },

  async addTeamMember(payload) {
    const res = await apiClient.post('/businesses/current/team', payload);
    return res.data;
  },
};
