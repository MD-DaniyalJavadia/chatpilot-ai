import apiClient from './apiClient';

export const adminMonitoringService = {
  async listChatbots({ search = '', status = 'all', businessId = '', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/admin/chatbots', {
      params: {
        search,
        status,
        businessId: businessId || undefined,
        page,
        pageSize,
      },
    });
    return res.data.data;
  },

  async setChatbotStatus(chatbotId, isEnabled) {
    const res = await apiClient.patch(`/admin/chatbots/${chatbotId}/status`, { isEnabled });
    return res.data;
  },

  async getAiUsage({ days = 30 } = {}) {
    const res = await apiClient.get('/admin/ai-usage', { params: { days } });
    return res.data.data;
  },

  async listConversations({ search = '', status = 'all', businessId = '', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/admin/conversations', {
      params: {
        search,
        status,
        businessId: businessId || undefined,
        page,
        pageSize,
      },
    });
    return res.data.data;
  },

  async getConversationTranscript(conversationId) {
    const res = await apiClient.get(`/admin/conversations/${conversationId}`);
    return res.data.data;
  },
};
