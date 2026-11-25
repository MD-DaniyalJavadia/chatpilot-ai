import { useCallback, useEffect, useState } from 'react';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Pagination,
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
import { extractApiError, formatCurrency, formatDateTime, formatNumber } from '../../utils/formatters';

export function AdminPaymentsPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [pendingAction, setPendingAction] = useState(null);
  const [updating, setUpdating] = useState(false);

  const pageSize = 15;

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await billingService.adminListPayments({ search, status, provider, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || {});
    } catch (err) {
      setError(extractApiError(err, 'Unable to load payment transactions.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, provider, page]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleConfirmUpdate = async () => {
    if (!pendingAction) return;
    setUpdating(true);
    setError('');
    setSuccess('');
    try {
      await billingService.adminUpdatePaymentStatus(pendingAction.paymentId, pendingAction.targetStatus);
      setSuccess(`Payment #${pendingAction.paymentId} marked as ${pendingAction.targetStatus}.`);
      setPendingAction(null);
      await loadPayments();
    } catch (err) {
      setError(extractApiError(err, 'Unable to update payment status.'));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Payment Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Audit verified billing settlements across Stripe, sandbox checkouts, and manual invoices, and reconcile pending or refunded charges.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard label="Settled Revenue" value={formatCurrency(summary.totalRevenueUsd)} loading={loading} />
        <StatCard label="Succeeded Payments" value={formatNumber(summary.succeededCount)} loading={loading} />
        <StatCard label="Pending Invoices" value={formatNumber(summary.pendingCount)} loading={loading} />
        <StatCard label="Failed / Refunded" value={formatNumber(summary.failedOrRefundedCount)} loading={loading} />
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 3 }} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search business, plan, or transaction ID..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            sx={{ flex: 1, minWidth: 220 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            select
            size="small"
            label="Gateway"
            value={provider}
            onChange={(e) => {
              setPage(1);
              setProvider(e.target.value);
            }}
            sx={{ minWidth: 165 }}
          >
            <MenuItem value="all">All Gateways</MenuItem>
            <MenuItem value="Stripe">Stripe</MenuItem>
            <MenuItem value="SandboxCard">SandboxCard</MenuItem>
            <MenuItem value="ManualInvoice">ManualInvoice</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="Succeeded">Succeeded</MenuItem>
            <MenuItem value="Pending">Pending</MenuItem>
            <MenuItem value="Refunded">Refunded</MenuItem>
            <MenuItem value="Failed">Failed</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Business & Transaction Ref</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Gateway</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Recorded</TableCell>
                <TableCell align="right">Reconcile</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No billing transactions recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.paymentId} hover>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {row.businessName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontFamily: "'JetBrains Mono', monospace" }}
                        noWrap
                      >
                        {row.externalTxnId || `#${row.paymentId}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.planName} ({row.billingCycle})
                    </TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell align="right" className="tabular-nums" sx={{ fontWeight: 600 }}>
                      {formatCurrency(row.amountUsd)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={row.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(row.paidOn || row.createdOn)}</TableCell>
                    <TableCell align="right">
                      {row.status === 'Pending' ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          onClick={() => setPendingAction({ ...row, targetStatus: 'Succeeded' })}
                        >
                          Mark Settled
                        </Button>
                      ) : row.status === 'Succeeded' && row.amountUsd > 0 ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => setPendingAction({ ...row, targetStatus: 'Refunded' })}
                        >
                          Mark Refunded
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {total > pageSize ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
            <Pagination count={Math.ceil(total / pageSize)} page={page} onChange={(_, p) => setPage(p)} size="small" />
          </Box>
        ) : null}
      </Paper>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.targetStatus === 'Succeeded' ? 'Mark Invoice as Settled?' : 'Mark Payment as Refunded?'}
        description={`Confirm updating payment ${pendingAction?.externalTxnId || `#${pendingAction?.paymentId}`} (${formatCurrency(pendingAction?.amountUsd)}) for ${pendingAction?.businessName} to ${pendingAction?.targetStatus}.`}
        confirmLabel={pendingAction?.targetStatus === 'Succeeded' ? 'Mark Settled' : 'Mark Refunded'}
        confirmColor={pendingAction?.targetStatus === 'Succeeded' ? 'success' : 'warning'}
        loading={updating}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmUpdate}
      />
    </Box>
  );
}
