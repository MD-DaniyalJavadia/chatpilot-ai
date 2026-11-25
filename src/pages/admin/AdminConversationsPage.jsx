import { useCallback, useEffect, useState } from 'react';
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
import { ConversationTranscriptDialog } from '../../components/common/ConversationTranscriptDialog';
import { StatusText } from '../../components/common/StatusText';
import { adminMonitoringService } from '../../services/adminMonitoringService';
import { businessService } from '../../services/businessService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function AdminConversationsPage() {
  const [businesses, setBusinesses] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [businessId, setBusinessId] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcript, setTranscript] = useState(null);

  const pageSize = 15;

  useEffect(() => {
    businessService
      .listBusinesses({ page: 1, pageSize: 50 })
      .then((res) => setBusinesses(res?.items || []))
      .catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminMonitoringService.listConversations({
        search,
        status,
        businessId,
        page,
        pageSize,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load platform conversations.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, businessId, page]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleInspect = async (conversationId) => {
    setDialogOpen(true);
    setTranscriptLoading(true);
    setTranscript(null);
    setError('');
    try {
      const data = await adminMonitoringService.getConversationTranscript(conversationId);
      setTranscript(data);
    } catch (err) {
      setDialogOpen(false);
      setError(extractApiError(err, 'Unable to load conversation transcript.'));
    } finally {
      setTranscriptLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Conversation Monitoring</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Audit cross-tenant widget sessions, inspect transcripts for quality or abuse, and track unanswered responses.
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
            placeholder="Search business, chatbot, session ID, or domain..."
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
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All Sessions</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
            <MenuItem value="unanswered">Has Unanswered</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Visitor Session</TableCell>
                <TableCell>Business Tenant</TableCell>
                <TableCell>Chatbot</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell align="right">Messages</TableCell>
                <TableCell align="right">Unanswered</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Activity</TableCell>
                <TableCell align="right">Inspect</TableCell>
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
                      No conversations recorded across tenants
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {search || status !== 'all' || businessId
                        ? 'Try clearing or adjusting your search and status filters.'
                        : 'Customer widget sessions will appear here once tenants deploy and receive messages.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.conversationId} hover>
                    <TableCell
                      sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.8125rem',
                        maxWidth: 220,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
                        noWrap
                      >
                        {row.visitorSession}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{row.businessName}</TableCell>
                    <TableCell>{row.chatbotName}</TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {row.visitorDomain || '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(row.messageCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(row.unansweredCount)}
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
                        onClick={() => handleInspect(row.conversationId)}
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
        readOnly
        onClose={() => setDialogOpen(false)}
      />
    </Box>
  );
}
