import { useCallback, useEffect, useState } from 'react';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { billingService } from '../../services/billingService';
import {
  extractApiError,
  formatCurrency,
  formatDateShort,
  formatDateTime,
  formatNumber,
} from '../../utils/formatters';

export function BusinessSubscriptionPage() {
  const [data, setData] = useState(null);
  const [billingCycle, setBillingCycle] = useState('Monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [paymentProvider, setPaymentProvider] = useState('SandboxCard');
  const [processing, setProcessing] = useState(false);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await billingService.getBusinessSubscription();
      setData(res);
      if (res && res.sandboxBillingEnabled === false) {
        setPaymentProvider((prev) =>
          prev === 'SandboxCard' ? (res.stripeConfigured ? 'Stripe' : 'ManualInvoice') : prev
        );
      }
    } catch (err) {
      setError(extractApiError(err, 'Unable to load subscription and billing details.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const current = data?.currentSubscription;
  const plans = data?.plans || [];
  const payments = data?.payments || [];
  const stripeConfigured = Boolean(data?.stripeConfigured);
  const sandboxBillingEnabled = Boolean(data?.sandboxBillingEnabled);
  const pendingPayment = payments.find((p) => p.status === 'Pending');

  const handleConfirmCheckout = async () => {
    if (!checkoutPlan) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      const res = await billingService.checkoutSubscription({
        planId: checkoutPlan.planId,
        billingCycle,
        provider: paymentProvider,
      });
      setSuccess(res.message || `Subscribed to ${checkoutPlan.name} (${billingCycle}).`);
      setCheckoutPlan(null);
      await loadSubscription();
    } catch (err) {
      setError(extractApiError(err, 'Unable to complete plan checkout.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    setError('');
    setSuccess('');
    try {
      const res = await billingService.cancelSubscription();
      setSuccess(res.message || 'Paid subscription cancelled.');
      setCancelConfirmOpen(false);
      await loadSubscription();
    } catch (err) {
      setError(extractApiError(err, 'Unable to cancel subscription.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Subscription & Billing</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review your active plan limits, upgrade or switch billing cycles, and audit workspace payment receipts.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ p: 0.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
          <Button
            size="small"
            variant={billingCycle === 'Monthly' ? 'contained' : 'text'}
            onClick={() => setBillingCycle('Monthly')}
          >
            Monthly
          </Button>
          <Button
            size="small"
            variant={billingCycle === 'Yearly' ? 'contained' : 'text'}
            onClick={() => setBillingCycle('Yearly')}
          >
            Yearly
          </Button>
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}
      {pendingPayment ? (
        <Alert severity="info">
          Payment <strong>{pendingPayment.externalTxnId || `#${pendingPayment.paymentId}`}</strong> for{' '}
          <strong>{pendingPayment.planName}</strong> ({formatCurrency(pendingPayment.amountUsd)}) is pending
          settlement. Your current active plan limits remain in effect until payment is settled.
        </Alert>
      ) : null}

      {/* Current Subscription Summary */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard
          label="Current Plan"
          value={current?.planName || 'Free'}
          helperText={current ? `${current.billingCycle} · ${current.status}` : 'Default Tier'}
          loading={loading}
        />
        <StatCard
          label="Chatbot Limit"
          value={formatNumber(current?.maxChatbots ?? 1)}
          helperText="Concurrent assistants allowed"
          loading={loading}
        />
        <StatCard
          label="Monthly Message Quota"
          value={formatNumber(current?.maxMonthlyMessages ?? 250)}
          helperText="Widget visitor turns per month"
          loading={loading}
        />
        <StatCard
          label="Next Renewal"
          value={current?.expiresOn ? formatDateShort(current.expiresOn) : 'No Expiry'}
          helperText={current?.allowWebsiteIngestion ? 'Website crawling enabled' : 'Docs & FAQ ingestion only'}
          loading={loading}
        />
      </Box>

      {current && current.planCode !== 'FREE' && current.status === 'Active' ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="outlined" color="warning" size="small" onClick={() => setCancelConfirmOpen(true)}>
            Cancel Paid Subscription
          </Button>
        </Box>
      ) : null}

      {/* Plan Comparison Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' },
          gap: 2.5,
        }}
      >
        {loading
          ? [1, 2, 3, 4].map((idx) => (
              <Paper key={idx} sx={{ p: 3 }}>
                <Skeleton height={220} />
              </Paper>
            ))
          : plans.map((plan) => {
              const price = billingCycle === 'Yearly' ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
              const isCurrent =
                current?.planId === plan.planId &&
                current?.status === 'Active' &&
                (plan.code === 'FREE' || current?.billingCycle === billingCycle);

              return (
                <Paper
                  key={plan.planId}
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 2.5,
                    borderColor: isCurrent ? 'primary.main' : 'divider',
                  }}
                >
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6">{plan.name}</Typography>
                      {isCurrent ? <StatusText status="Active" /> : null}
                    </Box>

                    <Typography
                      variant="h4"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, mb: 0.5 }}
                    >
                      {formatCurrency(price)}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                        / {billingCycle === 'Yearly' ? 'year' : 'month'}
                      </Typography>
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, mb: 2 }}>
                      {plan.description || 'Commercial SaaS workspace plan.'}
                    </Typography>

                    <Divider sx={{ mb: 2 }} />

                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckOutlinedIcon fontSize="small" color="primary" />
                        <Typography variant="body2" className="tabular-nums">
                          Up to {formatNumber(plan.maxChatbots)} AI chatbots
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckOutlinedIcon fontSize="small" color="primary" />
                        <Typography variant="body2" className="tabular-nums">
                          {formatNumber(plan.maxMonthlyMessages)} messages / month
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckOutlinedIcon fontSize="small" color="primary" />
                        <Typography variant="body2" className="tabular-nums">
                          {formatNumber(plan.maxTeamMembers)} team seats
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckOutlinedIcon
                          fontSize="small"
                          color={plan.allowWebsiteIngestion ? 'primary' : 'disabled'}
                        />
                        <Typography
                          variant="body2"
                          color={plan.allowWebsiteIngestion ? 'text.primary' : 'text.secondary'}
                        >
                          {plan.allowWebsiteIngestion ? 'Website URL ingestion' : 'PDF/DOCX/FAQ only'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Button
                    variant={isCurrent ? 'outlined' : 'contained'}
                    fullWidth
                    disabled={isCurrent}
                    onClick={() => setCheckoutPlan(plan)}
                  >
                    {isCurrent ? 'Current Plan' : price === 0 ? 'Switch to Free' : `Select ${plan.name}`}
                  </Button>
                </Paper>
              );
            })}
      </Box>

      {/* Payment History Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Payment History
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Invoices and checkout receipts recorded for this business workspace.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Gateway</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={40} />
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No billing transactions recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((pay) => (
                  <TableRow key={pay.paymentId} hover>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {pay.externalTxnId || `#${pay.paymentId}`}
                    </TableCell>
                    <TableCell>
                      {pay.planName} ({pay.billingCycle})
                    </TableCell>
                    <TableCell>{pay.provider}</TableCell>
                    <TableCell align="right" className="tabular-nums" sx={{ fontWeight: 600 }}>
                      {formatCurrency(pay.amountUsd)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={pay.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(pay.paidOn || pay.createdOn)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Checkout Dialog */}
      <Dialog open={Boolean(checkoutPlan)} onClose={() => !processing && setCheckoutPlan(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Confirm Plan Change</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Switch workspace to <strong>{checkoutPlan?.name}</strong> ({billingCycle}) for{' '}
            <strong>
              {formatCurrency(
                billingCycle === 'Yearly' ? checkoutPlan?.yearlyPriceUsd : checkoutPlan?.monthlyPriceUsd
              )}
            </strong>
            .
          </Typography>

          <TextField
            select
            size="small"
            label="Payment Method"
            value={paymentProvider}
            onChange={(e) => setPaymentProvider(e.target.value)}
            fullWidth
          >
            {sandboxBillingEnabled ? (
              <MenuItem value="SandboxCard">Instant Card Settlement (Sandbox)</MenuItem>
            ) : null}
            <MenuItem value="ManualInvoice">Manual Invoice (Net Terms)</MenuItem>
            {stripeConfigured ? <MenuItem value="Stripe">Stripe PaymentIntent</MenuItem> : null}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCheckoutPlan(null)} disabled={processing} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirmCheckout} disabled={processing} variant="contained">
            {processing
              ? 'Processing...'
              : (billingCycle === 'Yearly' ? checkoutPlan?.yearlyPriceUsd : checkoutPlan?.monthlyPriceUsd) === 0
                ? 'Confirm & Switch'
                : paymentProvider === 'ManualInvoice'
                  ? 'Issue Invoice'
                  : paymentProvider === 'Stripe'
                    ? 'Start Stripe Checkout'
                    : 'Confirm & Activate'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel Paid Subscription?"
        description="Your workspace will revert to the Free tier limits immediately. You can upgrade again at any time."
        confirmLabel="Cancel Subscription"
        confirmColor="warning"
        loading={cancelling}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleConfirmCancel}
      />
    </Box>
  );
}
