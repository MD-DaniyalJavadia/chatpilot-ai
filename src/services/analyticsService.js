import apiClient from './apiClient';

export const analyticsService = {
  async getOverview({ days = 30, chatbotId = '' } = {}) {
    const res = await apiClient.get('/analytics/overview', {
      params: {
        days,
        chatbotId: chatbotId || undefined,
      },
    });
    return res.data.data;
  },

  async getUsageSummary() {
    const res = await apiClient.get('/usage/summary');
    return res.data.data;
  },
};
