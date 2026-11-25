import apiClient from './apiClient';

export const knowledgeService = {
  async listSources(chatbotId, { search = '', type = 'All', status = 'All', page = 1, pageSize = 20 } = {}) {
    const res = await apiClient.get(`/chatbots/${chatbotId}/sources`, {
      params: { search, type, status, page, pageSize },
    });
    return res.data.data;
  },

  async getSourceDetail(chatbotId, sourceId) {
    const res = await apiClient.get(`/chatbots/${chatbotId}/sources/${sourceId}`);
    return res.data.data;
  },

  async uploadDocument(chatbotId, file, title = '', onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    if (title.trim()) {
      formData.append('title', title.trim());
    }

    const res = await apiClient.post(`/chatbots/${chatbotId}/sources/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
    return res.data;
  },

  async ingestWebsite(chatbotId, payload) {
    const res = await apiClient.post(`/chatbots/${chatbotId}/sources/website`, payload, {
      timeout: 60000,
    });
    return res.data;
  },

  async createFaq(chatbotId, payload) {
    const res = await apiClient.post(`/chatbots/${chatbotId}/sources/faq`, payload, {
      timeout: 45000,
    });
    return res.data;
  },

  async createManual(chatbotId, payload) {
    const res = await apiClient.post(`/chatbots/${chatbotId}/sources/manual`, payload, {
      timeout: 45000,
    });
    return res.data;
  },

  async updateSourceContent(chatbotId, sourceId, payload) {
    const res = await apiClient.put(`/chatbots/${chatbotId}/sources/${sourceId}`, payload, {
      timeout: 45000,
    });
    return res.data;
  },

  async reindexSource(chatbotId, sourceId, refreshCrawl = false) {
    const res = await apiClient.post(
      `/chatbots/${chatbotId}/sources/${sourceId}/reindex`,
      { refreshCrawl },
      { timeout: 60000 }
    );
    return res.data;
  },

  async deleteSource(chatbotId, sourceId) {
    const res = await apiClient.delete(`/chatbots/${chatbotId}/sources/${sourceId}`);
    return res.data;
  },

  async searchKnowledge(chatbotId, query, topK = 5) {
    const res = await apiClient.post(
      `/chatbots/${chatbotId}/sources/search`,
      { query, topK },
      { timeout: 30000 }
    );
    return res.data.data;
  },
};
