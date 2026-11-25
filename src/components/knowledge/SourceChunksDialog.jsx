import { useEffect, useState } from 'react';
import {
  Alert,
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
import { StatusText } from '../common/StatusText';
import { knowledgeService } from '../../services/knowledgeService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function SourceChunksDialog({ open, chatbotId, sourceId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !chatbotId || !sourceId) return;
    let active = true;
    setLoading(true);
    setError('');
    knowledgeService
      .getSourceDetail(chatbotId, sourceId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((err) => {
        if (active) setError(extractApiError(err, 'Unable to load indexed chunks.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, chatbotId, sourceId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        {detail?.title || 'Knowledge Source Inspector'}
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton height={32} width="60%" />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : detail ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Typography variant="body2" color="text.secondary" className="tabular-nums">
                {detail.sourceType}
                {detail.sourceUri ? ` · ${detail.sourceUri}` : ''}
                {detail.fileName ? ` · ${detail.fileName}` : ''}
                {' · '}
                {formatNumber(detail.chunkCount)} chunk(s) · {formatNumber(detail.totalTokens)} tokens
                {' · '}
                Indexed {formatDateTime(detail.lastIndexedOn || detail.updatedOn)}
              </Typography>
              <StatusText status={detail.status} />
            </Box>

            {detail.errorMessage ? <Alert severity="error">{detail.errorMessage}</Alert> : null}

            <Divider />

            {detail.chunks?.length ? (
              <Stack spacing={2}>
                {detail.chunks.map((chunk) => (
                  <Box
                    key={chunk.chunkId}
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      bgcolor: 'background.default',
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace", display: 'block', mb: 0.75 }}
                    >
                      Chunk #{chunk.chunkIndex + 1} · {formatNumber(chunk.tokenCount)} est. tokens
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {chunk.content}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No indexed vector chunks are stored for this source yet.
              </Typography>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
