import { useCallback, useEffect, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  Alert,
  Box,
  Button,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { useAuth } from '../../hooks/useAuth';
import { chatbotService } from '../../services/chatbotService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

export function ChatbotsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [quota, setQuota] = useState({ used: 0, limit: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [mutating, setMutating] = useState(false);

  const pageSize = 10;
  const canManage = user?.role === 'BusinessOwner' || user?.role === 'BusinessAdmin';

  const loadChatbots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await chatbotService.listChatbots({
        search,
        status: statusFilter,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
      if (data.quota) setQuota(data.quota);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load chatbots.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    loadChatbots();
  }, [loadChatbots]);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setMutating(true);
    setError('');
    try {
      if (confirmAction.type === 'delete') {
        await chatbotService.deleteChatbot(confirmAction.bot.chatbotId);
      } else if (confirmAction.type === 'toggle') {
        await chatbotService.setChatbotStatus(
          confirmAction.bot.chatbotId,
          !confirmAction.bot.isEnabled
        );
      }
      setConfirmAction(null);
      await loadChatbots();
    } catch (err) {
      setError(extractApiError(err, 'Unable to complete chatbot action.'));
      setConfirmAction(null);
    } finally {
      setMutating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4">My Chatbots</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage AI assistants, configure Gemini instructions, and launch the testing playground.
            {' · '}
            <span className="tabular-nums">
              {formatNumber(quota.used)} / {formatNumber(quota.limit)} slots used
            </span>
          </Typography>
        </Box>

        {canManage ? (
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon />}
            onClick={() => navigate('/app/chatbots/new')}
            disabled={quota.used >= quota.limit}
          >
            Create Chatbot
          </Button>
        ) : null}
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
            placeholder="Search chatbot name or description..."
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
            <MenuItem value="all">All Chatbots</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Chatbot</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Language · Tone</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.75 }}>
                      No chatbots found
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {search || statusFilter !== 'all'
                        ? 'Try clearing your search or status filter.'
                        : 'Create your first AI chatbot to configure instructions and test it in the Gemini Playground.'}
                    </Typography>
                    {canManage && !search && statusFilter === 'all' ? (
                      <Button variant="contained" onClick={() => navigate('/app/chatbots/new')}>
                        Create First Chatbot
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((bot) => (
                  <TableRow key={bot.chatbotId} hover>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {bot.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {bot.description || bot.businessName}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.8125rem',
                      }}
                    >
                      {bot.aiModel}
                    </TableCell>
                    <TableCell>
                      {bot.responseLanguage} · {bot.responseTone}
                    </TableCell>
                    <TableCell>
                      <StatusText status={bot.isEnabled ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(bot.createdOn)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.75} justifyContent="flex-end" alignItems="center">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PlayArrowOutlinedIcon />}
                          onClick={() => navigate(`/app/chatbots/${bot.chatbotId}/playground`)}
                        >
                          Playground
                        </Button>
                        {canManage ? (
                          <>
                            <Tooltip title="Knowledge Base">
                              <IconButton
                                size="small"
                                aria-label={`Knowledge base for ${bot.name}`}
                                onClick={() => navigate(`/app/knowledge?chatbotId=${bot.chatbotId}`)}
                              >
                                <MenuBookOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Widget Integration">
                              <IconButton
                                size="small"
                                aria-label={`Widget integration for ${bot.name}`}
                                onClick={() => navigate(`/app/widget?chatbotId=${bot.chatbotId}`)}
                              >
                                <CodeOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Configure settings">
                              <IconButton
                                size="small"
                                aria-label={`Configure ${bot.name}`}
                                onClick={() => navigate(`/app/chatbots/${bot.chatbotId}/configure`)}
                              >
                                <SettingsOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Button
                              size="small"
                              variant="text"
                              color={bot.isEnabled ? 'warning' : 'success'}
                              onClick={() => setConfirmAction({ type: 'toggle', bot })}
                            >
                              {bot.isEnabled ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Tooltip title="Delete chatbot">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete ${bot.name}`}
                                onClick={() => setConfirmAction({ type: 'delete', bot })}
                              >
                                <DeleteOutlineOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
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
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'delete'
            ? `Delete "${confirmAction?.bot?.name}"?`
            : `${confirmAction?.bot?.isEnabled ? 'Deactivate' : 'Activate'} "${confirmAction?.bot?.name}"?`
        }
        description={
          confirmAction?.type === 'delete'
            ? 'This permanently removes the chatbot and all of its configuration settings. This action cannot be undone.'
            : confirmAction?.bot?.isEnabled
              ? 'Deactivated chatbots will stop serving live customer requests while keeping their settings intact.'
              : 'Activating this chatbot marks it ready for live workspace usage.'
        }
        confirmLabel={
          confirmAction?.type === 'delete'
            ? 'Delete Chatbot'
            : confirmAction?.bot?.isEnabled
              ? 'Deactivate'
              : 'Activate'
        }
        confirmColor={confirmAction?.type === 'delete' ? 'error' : 'primary'}
        loading={mutating}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
    </Box>
  );
}
