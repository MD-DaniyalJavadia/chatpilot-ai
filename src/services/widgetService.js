import apiClient from './apiClient';

export const widgetService = {
  async listDomains(chatbotId) {
    const res = await apiClient.get(`/chatbots/${chatbotId}/domains`);
    return res.data.data;
  },

  async addDomain(chatbotId, domain) {
    const res = await apiClient.post(`/chatbots/${chatbotId}/domains`, { domain });
    return res.data.data;
  },

  async deleteDomain(chatbotId, domainId) {
    const res = await apiClient.delete(`/chatbots/${chatbotId}/domains/${domainId}`);
    return res.data;
  },

  async updateWidgetSettings(chatbotId, payload) {
    const res = await apiClient.put(`/chatbots/${chatbotId}/widget-settings`, payload);
    return res.data.data;
  },
};
