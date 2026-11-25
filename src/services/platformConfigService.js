import apiClient from './apiClient';

export const platformConfigService = {
  async getSystemSettings() {
    const res = await apiClient.get('/admin/settings');
    return res.data.data;
  },

  async updateSystemSettings(payload) {
    const res = await apiClient.put('/admin/settings', payload);
    return res.data;
  },

  async listAiProviders() {
    const res = await apiClient.get('/admin/ai-providers');
    return res.data.data;
  },

  async updateAiProvider(providerId, payload) {
    const res = await apiClient.put(`/admin/ai-providers/${providerId}`, payload);
    return res.data;
  },

  async setAiProviderStatus(providerId, isActive) {
    const res = await apiClient.patch(`/admin/ai-providers/${providerId}/status`, { isActive });
    return res.data;
  },
};
