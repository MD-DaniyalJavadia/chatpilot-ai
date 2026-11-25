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
import { adminMonitoringService } from '../../services/adminMonitoringService';
import { businessService } from '../../services/businessService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

export function AdminChatbotsPage() {
  const [businesses, setBusinesses] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [businessId, setBusinessId] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pendingToggle, setPendingToggle] = useState(null);
  const [toggling, setToggling] = useState(false);

  const pageSize = 15;

  useEffect(() => {
    businessService
      .listBusinesses({ page: 1, pageSize: 50 })
      .then((res) => setBusinesses(res?.items || []))
      .catch(() => {});
  }, []);

  const loadChatbots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminMonitoringService.listChatbots({
        search,
        status,
        businessId,
        page,
        pageSize,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load platform chatbots.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, businessId, page]);

  useEffect(() => {
    loadChatbots();
  }, [loadChatbots]);

  const handleConfirmToggle = async () => {
    if (!pendingToggle) return;
    setToggling(true);
    setError('');
    try {
      await adminMonitoringService.setChatbotStatus(pendingToggle.chatbotId, !pendingToggle.isEnabled);
      setPendingToggle(null);
      await loadChatbots();
    } catch (err) {
      setError(extractApiError(err, 'Unable to update chatbot status.'));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Global Chatbot Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Audit provisioned chatbots across all business workspaces, review model assignments, and apply emergency disable controls.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ mb: 3 }}
          alignItems={{ md: 'center' }}
        >
          <TextField
            size="small"
            placeholder="Search chatbot, public ID, or business..."
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
            label="Business"
            value={businessId}
            onChange={(e) => {
              setPage(1);
              setBusinessId(e.target.value);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All Businesses</MenuItem>
            {businesses.map((b) => (
              <MenuItem key={b.businessId} value={String(b.businessId)}>
                {b.name}
              </MenuItem>
            ))}
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
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Chatbot & Public ID</TableCell>
                <TableCell>Business Tenant</TableCell>
                <TableCell>AI Model</TableCell>
                <TableCell align="right">Conversations</TableCell>
                <TableCell align="right">Indexed KB</TableCell>
                <TableCell align="right">Domains</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Moderation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.75 }}>
                      No matching chatbots found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {search || status !== 'all' || businessId
                        ? 'Adjust or clear your search and tenant filters to inspect all chatbots.'
                        : 'No business workspaces have provisioned chatbots yet.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((bot) => (
                  <TableRow key={bot.chatbotId} hover>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {bot.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontFamily: "'JetBrains Mono', monospace" }}
                        noWrap
                      >
                        {bot.publicId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {bot.businessName}
                      </Typography>
                      <StatusText status={bot.businessStatus} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {bot.aiModel}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.conversationCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.indexedSourcesCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.allowedDomainsCount)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={bot.isEnabled ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(bot.createdOn)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        color={bot.isEnabled ? 'error' : 'success'}
                        onClick={() => setPendingToggle(bot)}
                      >
                        {bot.isEnabled ? 'Disable' : 'Enable'}
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
        open={Boolean(pendingToggle)}
        title={pendingToggle?.isEnabled ? 'Disable Chatbot Across All Widgets?' : 'Re-enable Chatbot?'}
        description={
          pendingToggle?.isEnabled
            ? `Disabling "${pendingToggle?.name}" (${pendingToggle?.businessName}) will immediately stop all public widget and playground responses for this assistant.`
            : `Re-enabling "${pendingToggle?.name}" (${pendingToggle?.businessName}) restores widget and playground responses.`
        }
        confirmLabel={pendingToggle?.isEnabled ? 'Disable Chatbot' : 'Enable Chatbot'}
        confirmColor={pendingToggle?.isEnabled ? 'error' : 'success'}
        loading={toggling}
        onClose={() => setPendingToggle(null)}
        onConfirm={handleConfirmToggle}
      />
    </Box>
  );
}
