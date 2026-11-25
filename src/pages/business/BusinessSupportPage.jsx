import { useCallback, useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useForm } from 'react-hook-form';
import { StatusText } from '../../components/common/StatusText';
import { TicketThreadDialog } from '../../components/common/TicketThreadDialog';
import { useAuth } from '../../hooks/useAuth';
import { createTicketSchema } from '../../schemas/phase6Schemas';
import { ticketsService } from '../../services/ticketsService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function BusinessSupportPage() {
  const { bootstrapStatus } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [threadOpen, setThreadOpen] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadData, setThreadData] = useState(null);

  const pageSize = 15;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(createTicketSchema),
    defaultValues: {
      subject: '',
      category: 'General',
      priority: 'Normal',
      message: '',
    },
  });

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ticketsService.listBusinessTickets({ status, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const onCreateSubmit = async (values) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await ticketsService.createTicket(values);
      setCreateOpen(false);
      reset();
      setSuccess('Support ticket submitted to the ChatPilot team.');
      await loadTickets();
    } catch (err) {
      setError(extractApiError(err, 'Unable to submit support ticket.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openThread = async (ticketId) => {
    setThreadOpen(true);
    setThreadLoading(true);
    setThreadData(null);
    setError('');
    try {
      const data = await ticketsService.getTicketThread(ticketId);
      setThreadData(data);
    } catch (err) {
      setThreadOpen(false);
      setError(extractApiError(err, 'Unable to load support ticket thread.'));
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Support Tickets</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Open a direct support escalation for billing, widget integration, or AI quality questions and track replies
            {bootstrapStatus?.supportContactEmail ? ` — or email ${bootstrapStatus.supportContactEmail}.` : '.'}
          </Typography>
        </Box>

        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setCreateOpen(true)}>
          New Support Ticket
        </Button>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
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
            <MenuItem value="all">All Tickets</MenuItem>
            <MenuItem value="Open">Open</MenuItem>
            <MenuItem value="InProgress">InProgress</MenuItem>
            <MenuItem value="Resolved">Resolved</MenuItem>
            <MenuItem value="Closed">Closed</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Replies</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell align="right">View</TableCell>
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
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.75 }}>
                      No support tickets submitted
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Need help with domain allowlisting, billing, or RAG tuning? Open a ticket anytime.
                    </Typography>
                    <Button variant="outlined" onClick={() => setCreateOpen(true)}>
                      Open Support Ticket
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((t) => (
                  <TableRow key={t.ticketId} hover>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        #{t.ticketId} · {t.subject}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created by {t.createdByName}
                      </Typography>
                    </TableCell>
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
                        Open
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

      <Dialog open={createOpen} onClose={() => !submitting && setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Open Support Ticket</DialogTitle>
        <Box component="form" onSubmit={handleSubmit(onCreateSubmit)} noValidate>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Subject"
              size="small"
              fullWidth
              {...register('subject')}
              error={Boolean(errors.subject)}
              helperText={errors.subject?.message}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Category"
                size="small"
                fullWidth
                defaultValue="General"
                {...register('category')}
                error={Boolean(errors.category)}
                helperText={errors.category?.message}
              >
                <MenuItem value="General">General</MenuItem>
                <MenuItem value="Billing">Billing</MenuItem>
                <MenuItem value="Technical">Technical</MenuItem>
                <MenuItem value="AIQuality">AI Quality</MenuItem>
                <MenuItem value="Security">Security</MenuItem>
              </TextField>

              <TextField
                select
                label="Priority"
                size="small"
                fullWidth
                defaultValue="Normal"
                {...register('priority')}
                error={Boolean(errors.priority)}
                helperText={errors.priority?.message}
              >
                <MenuItem value="Low">Low</MenuItem>
                <MenuItem value="Normal">Normal</MenuItem>
                <MenuItem value="High">High</MenuItem>
                <MenuItem value="Urgent">Urgent</MenuItem>
              </TextField>
            </Stack>
            <TextField
              label="Message"
              size="small"
              fullWidth
              multiline
              minRows={4}
              placeholder="Describe the issue, chatbot public ID, or domain details..."
              {...register('message')}
              error={Boolean(errors.message)}
              helperText={errors.message?.message}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setCreateOpen(false)} disabled={submitting} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <TicketThreadDialog
        open={threadOpen}
        loading={threadLoading}
        data={threadData}
        isAdmin={false}
        onClose={() => setThreadOpen(false)}
        onReply={handleReply}
      />
    </Box>
  );
}
