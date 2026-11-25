import apiClient from './apiClient';

export const billingService = {
  async listPlans({ includeInactive = false } = {}) {
    const res = await apiClient.get('/plans', { params: { includeInactive } });
    return res.data.data;
  },

  async createPlan(payload) {
    const res = await apiClient.post('/plans', payload);
    return res.data;
  },

  async updatePlan(planId, payload) {
    const res = await apiClient.put(`/plans/${planId}`, payload);
    return res.data;
  },

  async setPlanStatus(planId, isActive) {
    const res = await apiClient.patch(`/plans/${planId}/status`, { isActive });
    return res.data;
  },

  async getBusinessSubscription() {
    const res = await apiClient.get('/subscription');
    return res.data.data;
  },

  async checkoutSubscription({ planId, billingCycle, provider }) {
    const res = await apiClient.post('/subscription/checkout', { planId, billingCycle, provider });
    return res.data;
  },

  async cancelSubscription() {
    const res = await apiClient.post('/subscription/cancel');
    return res.data;
  },

  async adminListSubscriptions({ search = '', status = 'all', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/admin/subscriptions', {
      params: { search, status, page, pageSize },
    });
    return res.data.data;
  },

  async adminUpdateSubscription(subscriptionId, payload) {
    const res = await apiClient.patch(`/admin/subscriptions/${subscriptionId}`, payload);
    return res.data;
  },

  async adminListPayments({ search = '', status = 'all', provider = 'all', page = 1, pageSize = 15 } = {}) {
    const res = await apiClient.get('/admin/payments', {
      params: { search, status, provider, page, pageSize },
    });
    return res.data.data;
  },

  async adminUpdatePaymentStatus(paymentId, status) {
    const res = await apiClient.patch(`/admin/payments/${paymentId}/status`, { status });
    return res.data;
  },
};
