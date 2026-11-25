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
import { StatusText } from '../../components/common/StatusText';
import { businessService } from '../../services/businessService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

export function BusinessesManagementPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [mutating, setMutating] = useState(false);

  const pageSize = 10;

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await businessService.listBusinesses({
        search,
        status: statusFilter,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load businesses.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const handleConfirmStatusChange = async () => {
    if (!confirmTarget) return;
    setMutating(true);
    try {
      await businessService.updateBusinessStatus(confirmTarget.businessId, confirmTarget.nextStatus);
      setConfirmTarget(null);
      await loadBusinesses();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update business status.'));
    } finally {
      setMutating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Business Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Activate, suspend, or deactivate customer workspaces across the SaaS platform.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ mb: 3 }}
          justifyContent="space-between"
        >
          <TextField
            size="small"
            placeholder="Search business name, email, industry..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            sx={{ minWidth: { sm: 320 } }}
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
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="Active">Active</MenuItem>
            <MenuItem value="Suspended">Suspended</MenuItem>
            <MenuItem value="Deactivated">Deactivated</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Business</TableCell>
                <TableCell>Support Email</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell align="right">Team</TableCell>
                <TableCell align="right">Bots</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No matching businesses found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((biz) => (
                  <TableRow key={biz.businessId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {biz.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {biz.industry || biz.slug}
                      </Typography>
                    </TableCell>
                    <TableCell>{biz.supportEmail || '—'}</TableCell>
                    <TableCell>{biz.planName}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(biz.memberCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(biz.chatbotCount)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={biz.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(biz.createdOn)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {biz.status !== 'Active' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            onClick={() =>
                              setConfirmTarget({
                                businessId: biz.businessId,
                                name: biz.name,
                                nextStatus: 'Active',
                              })
                            }
                          >
                            Activate
                          </Button>
                        ) : null}
                        {biz.status === 'Active' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() =>
                              setConfirmTarget({
                                businessId: biz.businessId,
                                name: biz.name,
                                nextStatus: 'Suspended',
                              })
                            }
                          >
                            Suspend
                          </Button>
                        ) : null}
                        {biz.status !== 'Deactivated' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() =>
                              setConfirmTarget({
                                businessId: biz.businessId,
                                name: biz.name,
                                nextStatus: 'Deactivated',
                              })
                            }
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {total > pageSize ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
            <Pagination
              count={Math.ceil(total / pageSize)}
              page={page}
              onChange={(_, p) => setPage(p)}
              size="small"
            />
          </Box>
        ) : null}
      </Paper>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={`Set ${confirmTarget?.name} to ${confirmTarget?.nextStatus}?`}
        description={
          confirmTarget?.nextStatus === 'Active'
            ? 'Members of this workspace will regain access to the dashboard and API.'
            : `Members of this workspace will be blocked from signing in while status is ${confirmTarget?.nextStatus}.`
        }
        confirmLabel={`Set ${confirmTarget?.nextStatus || ''}`}
        confirmColor={confirmTarget?.nextStatus === 'Deactivated' ? 'error' : 'primary'}
        loading={mutating}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmStatusChange}
      />
    </Box>
  );
}
