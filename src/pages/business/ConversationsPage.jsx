import { useCallback, useEffect, useState } from 'react';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
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
import { useNavigate } from 'react-router-dom';
import { ConversationTranscriptDialog } from '../../components/common/ConversationTranscriptDialog';
import { StatusText } from '../../components/common/StatusText';
import { chatbotService } from '../../services/chatbotService';
import { conversationsService } from '../../services/conversationsService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function ConversationsPage() {
  const navigate = useNavigate();
  const [chatbots, setChatbots] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [chatbotId, setChatbotId] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [resolving, setResolving] = useState(false);

  const pageSize = 15;

  useEffect(() => {
    chatbotService
      .listChatbots({ page: 1, pageSize: 50 })
      .then((res) => setChatbots(res?.items || []))
      .catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await conversationsService.listConversations({
        search,
        status,
        chatbotId,
        dateFrom,
        dateTo,
        page,
        pageSize,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load customer conversations.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, chatbotId, dateFrom, dateTo, page]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleOpenTranscript = async (conversationId) => {
    setDialogOpen(true);
    setTranscriptLoading(true);
    setTranscript(null);
    setError('');
    try {
      const data = await conversationsService.getTranscript(conversationId);
      setTranscript(data);
    } catch (err) {
      setDialogOpen(false);
      setError(extractApiError(err, 'Unable to load conversation transcript.'));
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleToggleResolve = async (conv) => {
    setResolving(true);
    setError('');
    try {
      const nextResolved = !conv.isResolved;
      await conversationsService.setResolved(conv.conversationId, nextResolved);
      setTranscript((prev) =>
        prev
          ? {
              ...prev,
              conversation: { ...prev.conversation, isResolved: nextResolved },
            }
          : prev
      );
      await loadConversations();
    } catch (err) {
      setError(extractApiError(err, 'Unable to update conversation status.'));
    } finally {
      setResolving(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const blob = await conversationsService.exportCsv({ chatbotId, status });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatpilot-conversations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractApiError(err, 'Unable to export conversations CSV.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Conversations</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Inspect visitor widget transcripts, spot unanswered prompts needing Knowledge Base coverage, and export logs.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<DownloadOutlinedIcon />}
          onClick={handleExportCsv}
          disabled={exporting || loading}
        >
          {exporting ? 'Exporting...' : 'Download CSV'}
        </Button>
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
            placeholder="Search session, domain, or message text..."
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
            label="Chatbot"
            value={chatbotId}
            onChange={(e) => {
              setPage(1);
              setChatbotId(e.target.value);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Chatbots</MenuItem>
            {chatbots.map((b) => (
              <MenuItem key={b.chatbotId} value={String(b.chatbotId)}>
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
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="all">All Sessions</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
            <MenuItem value="unanswered">Needs KB Review</MenuItem>
          </TextField>

          <TextField
            size="small"
            type="date"
            label="From"
            value={dateFrom}
            onChange={(e) => {
              setPage(1);
              setDateFrom(e.target.value);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 155 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => {
              setPage(1);
              setDateTo(e.target.value);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 155 }}
          />
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Visitor & First Question</TableCell>
                <TableCell>Chatbot</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell align="right">Messages</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Activity</TableCell>
                <TableCell align="right">Action</TableCell>
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
                  <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.75 }}>
                      No conversations recorded yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {search || status !== 'all' || chatbotId || dateFrom || dateTo
                        ? 'Try adjusting or clearing your search and date filters.'
                        : 'Embed and test your widget in Widget Integration to capture real customer sessions here.'}
                    </Typography>
                    {!search && status === 'all' && !chatbotId ? (
                      <Button variant="outlined" onClick={() => navigate('/app/widget')}>
                        Open Widget Integration
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.conversationId} hover>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {row.firstUserQuestion || row.visitorSession}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontFamily: "'JetBrains Mono', monospace" }}
                        noWrap
                      >
                        {row.visitorSession}
                        {row.unansweredCount > 0 ? ` · ${row.unansweredCount} unanswered` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.chatbotName}</TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {row.visitorDomain || '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(row.messageCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(row.tokensUsed)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={row.isResolved ? 'Resolved' : 'Open'} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(row.updatedOn)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<VisibilityOutlinedIcon />}
                        onClick={() => handleOpenTranscript(row.conversationId)}
                      >
                        Inspect
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

      <ConversationTranscriptDialog
        open={dialogOpen}
        loading={transcriptLoading}
        transcript={transcript}
        resolving={resolving}
        onClose={() => setDialogOpen(false)}
        onToggleResolve={handleToggleResolve}
      />
    </Box>
  );
}
