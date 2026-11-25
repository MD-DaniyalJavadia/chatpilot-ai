import apiClient from './apiClient';

export const conversationsService = {
  async listConversations({ search = '', status = 'all', chatbotId = '', dateFrom = '', dateTo = '', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/conversations', {
      params: {
        search,
        status,
        chatbotId: chatbotId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize,
      },
    });
    return res.data.data;
  },

  async getTranscript(conversationId) {
    const res = await apiClient.get(`/conversations/${conversationId}`);
    return res.data.data;
  },

  async setResolved(conversationId, isResolved) {
    const res = await apiClient.patch(`/conversations/${conversationId}/resolve`, { isResolved });
    return res.data;
  },

  async exportCsv({ chatbotId = '', status = 'all' } = {}) {
    const res = await apiClient.get('/conversations/export', {
      params: {
        chatbotId: chatbotId || undefined,
        status,
      },
      responseType: 'blob',
    });
    return res.data;
  },
};
