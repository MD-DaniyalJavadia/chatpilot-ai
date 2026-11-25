import { useCallback, useEffect, useState } from 'react';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { billingService } from '../../services/billingService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

export function AdminSubscriptionsPage() {
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editing, setEditing] = useState(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [editCycle, setEditCycle] = useState('Monthly');
  const [editStatus, setEditStatus] = useState('Active');
  const [saving, setSaving] = useState(false);

  const pageSize = 15;

  useEffect(() => {
    billingService
      .listPlans({ includeInactive: true })
      .then((res) => setPlans(res?.items || []))
      .catch(() => {});
  }, []);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await billingService.adminListSubscriptions({ search, status, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || {});
    } catch (err) {
      setError(extractApiError(err, 'Unable to load tenant subscriptions.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const openEdit = (sub) => {
    setEditing(sub);
    setEditPlanId(String(sub.planId));
    setEditCycle(sub.billingCycle || 'Monthly');
    setEditStatus(sub.status || 'Active');
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await billingService.adminUpdateSubscription(editing.subscriptionId, {
        planId: Number(editPlanId),
        billingCycle: editCycle,
        status: editStatus,
      });
      setSuccess(`Updated subscription #${editing.subscriptionId} for ${editing.businessName}.`);
      setEditing(null);
      await loadSubscriptions();
    } catch (err) {
      setError(extractApiError(err, 'Unable to update subscription.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Subscription Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Monitor active, past-due, expired, and cancelled tenant subscriptions and override plans when assisting accounts.
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
        <StatCard label="Active" value={formatNumber(summary.activeCount)} loading={loading} />
        <StatCard label="Past Due" value={formatNumber(summary.pastDueCount)} loading={loading} />
        <StatCard label="Expired" value={formatNumber(summary.expiredCount)} loading={loading} />
        <StatCard label="Cancelled" value={formatNumber(summary.cancelledCount)} loading={loading} />
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 3 }} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search business or plan name..."
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
            label="Status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="PastDue">PastDue</MenuItem>
            <MenuItem value="Expired">Expired</MenuItem>
            <MenuItem value="Cancelled">Cancelled</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Business Tenant</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Cycle</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Starts</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Manage</TableCell>
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
                      No subscription records match the current filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((sub) => (
                  <TableRow key={sub.subscriptionId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {sub.businessName}
                      </Typography>
                      <StatusText status={sub.businessStatus} />
                    </TableCell>
                    <TableCell>{sub.planName}</TableCell>
                    <TableCell>{sub.billingCycle}</TableCell>
                    <TableCell>
                      <StatusText status={sub.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(sub.startsOn)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(sub.expiresOn)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(sub)}>
                        Override
                      </Button>
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

      <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Update Subscription</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {editing?.businessName} (ID #{editing?.subscriptionId})
          </Typography>
          <TextField
            select
            size="small"
            label="Plan Tier"
            value={editPlanId}
            onChange={(e) => setEditPlanId(e.target.value)}
            fullWidth
          >
            {plans.map((p) => (
              <MenuItem key={p.planId} value={String(p.planId)}>
                {p.name} ({p.code})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Billing Cycle"
            value={editCycle}
            onChange={(e) => setEditCycle(e.target.value)}
            fullWidth
          >
            <MenuItem value="Monthly">Monthly</MenuItem>
            <MenuItem value="Yearly">Yearly</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Subscription Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            fullWidth
          >
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="PastDue">PastDue</MenuItem>
            <MenuItem value="Expired">Expired</MenuItem>
            <MenuItem value="Cancelled">Cancelled</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditing(null)} disabled={saving} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
