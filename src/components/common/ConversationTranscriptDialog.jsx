import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { StatusText } from './StatusText';
import { formatDateTime, formatNumber } from '../../utils/formatters';

export function ConversationTranscriptDialog({
  open,
  loading,
  transcript,
  onClose,
  onToggleResolve,
  resolving = false,
  readOnly = false,
}) {
  const conv = transcript?.conversation;
  const messages = transcript?.messages || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6">
            {conv ? `${conv.chatbotName} Transcript` : 'Conversation Transcript'}
          </Typography>
          {conv ? <StatusText status={conv.isResolved ? 'Resolved' : 'Open'} /> : null}
        </Box>
        {conv ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {conv.businessName ? `${conv.businessName} · ` : ''}
            <Box component="span" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {conv.visitorSession}
            </Box>
            {conv.visitorDomain ? ` · ${conv.visitorDomain}` : ''}
            {` · Started ${formatDateTime(conv.createdOn)}`}
          </Typography>
        ) : null}
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ py: 2.5, maxHeight: '62vh', overflowY: 'auto' }}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton height={56} />
            <Skeleton height={84} />
            <Skeleton height={56} />
          </Stack>
        ) : messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No messages recorded in this session yet.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {messages.map((msg) => {
              const isUser = msg.senderType === 'User';
              return (
                <Box
                  key={msg.messageId}
                  sx={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}
                >
                  <Box
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderRadius: 2,
                      bgcolor: isUser ? 'primary.main' : 'background.default',
                      color: isUser ? 'primary.contrastText' : 'text.primary',
                      border: isUser ? 0 : 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.content}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      mt: 0.5,
                      textAlign: isUser ? 'right' : 'left',
                    }}
                    className="tabular-nums"
                  >
                    {isUser ? 'Visitor' : 'Assistant'}
                    {' · '}
                    {formatDateTime(msg.createdOn)}
                    {!isUser && msg.tokensUsed > 0 ? ` · ${formatNumber(msg.tokensUsed)} tokens` : ''}
                    {msg.isUnanswered ? ' · Needs KB review' : ''}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 1.75, justifyContent: 'space-between' }}>
        <Box>
          {!readOnly && conv && onToggleResolve ? (
            <Button
              variant="outlined"
              color={conv.isResolved ? 'warning' : 'success'}
              disabled={resolving || loading}
              onClick={() => onToggleResolve(conv)}
            >
              {resolving
                ? 'Updating...'
                : conv.isResolved
                  ? 'Reopen Conversation'
                  : 'Mark as Resolved'}
            </Button>
          ) : null}
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
