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
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { TicketThreadDialog } from '../../components/common/TicketThreadDialog';
import { ticketsService } from '../../services/ticketsService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function AdminTicketsPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadData, setThreadData] = useState(null);

  const pageSize = 15;

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ticketsService.adminListTickets({ search, status, priority, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || {});
    } catch (err) {
      setError(extractApiError(err, 'Unable to load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, priority, page]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const openThread = async (ticketId) => {
    setDialogOpen(true);
    setThreadLoading(true);
    setThreadData(null);
    setError('');
    try {
      const data = await ticketsService.getTicketThread(ticketId);
      setThreadData(data);
    } catch (err) {
      setDialogOpen(false);
      setError(extractApiError(err, 'Unable to load ticket conversation.'));
    } finally {
      setThreadLoading(false);
    }
  };

  const handleReply = async (ticketId, body) => {
    await ticketsService.replyToTicket(ticketId, body);
    const updated = await ticketsService.getTicketThread(ticketId);
    setThreadData(updated);
    await loadTickets();
  };

  const handleAdminUpdate = async (ticketId, patch) => {
    await ticketsService.adminUpdateTicket(ticketId, patch);
    const updated = await ticketsService.getTicketThread(ticketId);
    setThreadData(updated);
    await loadTickets();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Support Tickets</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Triage tenant support requests, respond to escalations, and update priority and resolution states.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard label="Open" value={formatNumber(summary.openCount)} loading={loading} />
        <StatCard label="In Progress" value={formatNumber(summary.inProgressCount)} loading={loading} />
        <StatCard label="High / Urgent Active" value={formatNumber(summary.urgentActiveCount)} loading={loading} />
        <StatCard label="Resolved" value={formatNumber(summary.resolvedCount)} loading={loading} />
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 3 }} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search subject, business name, or requester email..."
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
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="Open">Open</MenuItem>
            <MenuItem value="InProgress">InProgress</MenuItem>
            <MenuItem value="Resolved">Resolved</MenuItem>
            <MenuItem value="Closed">Closed</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Priority"
            value={priority}
            onChange={(e) => {
              setPage(1);
              setPriority(e.target.value);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All Priorities</MenuItem>
            <MenuItem value="Urgent">Urgent</MenuItem>
            <MenuItem value="High">High</MenuItem>
            <MenuItem value="Normal">Normal</MenuItem>
            <MenuItem value="Low">Low</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ticket & Subject</TableCell>
                <TableCell>Business Tenant</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Replies</TableCell>
                <TableCell>Updated</TableCell>
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
                  <TableCell colSpan={8} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No support tickets match your filter criteria.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((t) => (
                  <TableRow key={t.ticketId} hover>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        #{t.ticketId} · {t.subject}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {t.createdByName} ({t.createdByEmail})
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{t.businessName}</TableCell>
                    <TableCell>{t.category}</TableCell>
                    <TableCell>
                      <StatusText status={t.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusText status={t.status} />
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(t.messageCount)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(t.updatedOn)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<VisibilityOutlinedIcon />}
                        onClick={() => openThread(t.ticketId)}
                      >
                        Respond
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

      <TicketThreadDialog
        open={dialogOpen}
        loading={threadLoading}
        data={threadData}
        isAdmin
        onClose={() => setDialogOpen(false)}
        onReply={handleReply}
        onAdminUpdate={handleAdminUpdate}
      />
    </Box>
  );
}
