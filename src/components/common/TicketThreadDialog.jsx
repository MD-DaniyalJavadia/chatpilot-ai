import { useState } from 'react';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
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
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { StatusText } from './StatusText';
import { formatDateTime } from '../../utils/formatters';

export function TicketThreadDialog({
  open,
  loading,
  data,
  isAdmin = false,
  onClose,
  onReply,
  onAdminUpdate,
}) {
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [error, setError] = useState('');

  const ticket = data?.ticket;
  const messages = data?.messages || [];

  const handleSendReply = async (e) => {
    e.preventDefault();
    const trimmed = replyBody.trim();
    if (trimmed.length < 2) return;
    setSubmitting(true);
    setError('');
    try {
      await onReply(ticket.ticketId, trimmed);
      setReplyBody('');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMetaChange = async (field, value) => {
    if (!ticket || !onAdminUpdate) return;
    setUpdatingMeta(true);
    setError('');
    try {
      await onAdminUpdate(ticket.ticketId, { [field]: value });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to update ticket.');
    } finally {
      setUpdatingMeta(false);
    }
  };

  const canReply = ticket && (isAdmin || ticket.status !== 'Closed');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6">
            {ticket ? `#${ticket.ticketId} · ${ticket.subject}` : 'Support Ticket'}
          </Typography>
          {ticket ? <StatusText status={ticket.status} /> : null}
        </Box>
        {ticket ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {ticket.businessName ? `${ticket.businessName} · ` : ''}
            {ticket.createdByName} · {ticket.category} · Priority: {ticket.priority} · Opened {formatDateTime(ticket.createdOn)}
          </Typography>
        ) : null}
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}

        {isAdmin && ticket ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              label="Status"
              value={ticket.status}
              disabled={updatingMeta}
              onChange={(e) => handleMetaChange('status', e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="Open">Open</MenuItem>
              <MenuItem value="InProgress">InProgress</MenuItem>
              <MenuItem value="Resolved">Resolved</MenuItem>
              <MenuItem value="Closed">Closed</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Priority"
              value={ticket.priority}
              disabled={updatingMeta}
              onChange={(e) => handleMetaChange('priority', e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="Low">Low</MenuItem>
              <MenuItem value="Normal">Normal</MenuItem>
              <MenuItem value="High">High</MenuItem>
              <MenuItem value="Urgent">Urgent</MenuItem>
            </TextField>
          </Stack>
        ) : null}

        <Box sx={{ maxHeight: '44vh', overflowY: 'auto', pr: 0.5 }}>
          {loading ? (
            <Stack spacing={2}>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </Stack>
          ) : messages.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              No messages on this ticket yet.
            </Typography>
          ) : (
            <Stack spacing={1.75}>
              {messages.map((m) => {
                const isSupport = m.senderRole === 'SuperAdmin';
                return (
                  <Box
                    key={m.ticketMessageId}
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: isSupport ? 'action.hover' : 'background.default',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75, gap: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {m.senderName} ({isSupport ? 'Platform Support' : 'Business Team'})
                      </Typography>
                      <Typography variant="caption" color="text.secondary" className="tabular-nums">
                        {formatDateTime(m.createdOn)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.body}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>

        {canReply ? (
          <Box component="form" onSubmit={handleSendReply} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <TextField
              multiline
              minRows={3}
              maxRows={6}
              fullWidth
              size="small"
              label={isAdmin ? 'Support Team Reply' : 'Add Reply'}
              placeholder="Write an update or resolution note..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              disabled={submitting}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                size="small"
                startIcon={<SendOutlinedIcon />}
                disabled={submitting || replyBody.trim().length < 2}
              >
                {submitting ? 'Sending...' : 'Send Reply'}
              </Button>
            </Box>
          </Box>
        ) : ticket?.status === 'Closed' ? (
          <Alert severity="info">This support ticket is closed. Open a new ticket if you need further assistance.</Alert>
        ) : null}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
