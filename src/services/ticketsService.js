import apiClient from './apiClient';

export const ticketsService = {
  async listBusinessTickets({ status = 'all', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/tickets', { params: { status, page, pageSize } });
    return res.data.data;
  },

  async createTicket(payload) {
    const res = await apiClient.post('/tickets', payload);
    return res.data;
  },

  async getTicketThread(ticketId) {
    const res = await apiClient.get(`/tickets/${ticketId}`);
    return res.data.data;
  },

  async replyToTicket(ticketId, body) {
    const res = await apiClient.post(`/tickets/${ticketId}/messages`, { body });
    return res.data;
  },

  async adminListTickets({ search = '', status = 'all', priority = 'all', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/admin/tickets', {
      params: { search, status, priority, page, pageSize },
    });
    return res.data.data;
  },

  async adminUpdateTicket(ticketId, payload) {
    const res = await apiClient.patch(`/admin/tickets/${ticketId}`, payload);
    return res.data;
  },
};
