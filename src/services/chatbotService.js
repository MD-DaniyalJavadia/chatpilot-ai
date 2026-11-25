import apiClient from './apiClient';

export const chatbotService = {
  async listProviders() {
    const res = await apiClient.get('/chatbots/providers');
    return res.data.data;
  },

  async listChatbots({ search = '', status = 'all', page = 1, pageSize = 10 } = {}) {
    const res = await apiClient.get('/chatbots', {
      params: { search, status, page, pageSize },
    });
    return res.data.data;
  },

  async getChatbot(chatbotId) {
    const res = await apiClient.get(`/chatbots/${chatbotId}`);
    return res.data.data;
  },

  async createChatbot(payload) {
    const res = await apiClient.post('/chatbots', payload);
    return res.data.data;
  },

  async updateConfiguration(chatbotId, payload) {
    const res = await apiClient.put(`/chatbots/${chatbotId}`, payload);
    return res.data.data;
  },

  async setChatbotStatus(chatbotId, isEnabled) {
    const res = await apiClient.patch(`/chatbots/${chatbotId}/status`, { isEnabled });
    return res.data;
  },

  async deleteChatbot(chatbotId) {
    const res = await apiClient.delete(`/chatbots/${chatbotId}`);
    return res.data;
  },

  async sendPlaygroundMessage(chatbotId, payload) {
    const res = await apiClient.post(`/chatbots/${chatbotId}/playground`, payload, {
      timeout: 95000,
    });
    return res.data.data;
  },
};
