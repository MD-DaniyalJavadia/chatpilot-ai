import { useCallback, useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
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
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { SourceChunksDialog } from '../../components/knowledge/SourceChunksDialog';
import { chatbotService } from '../../services/chatbotService';
import { knowledgeService } from '../../services/knowledgeService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';
import { websiteSourceSchema } from '../../validations/knowledgeSchemas';

export function WebsiteSourcesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatbotParam = Number(searchParams.get('chatbotId')) || '';

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(initialChatbotParam);
  const [loadingBots, setLoadingBots] = useState(true);

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [reindexingId, setReindexingId] = useState(null);
  const [inspectSourceId, setInspectSourceId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutating, setMutating] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(websiteSourceSchema),
    defaultValues: {
      url: '',
      title: '',
      crawlMode: 'single',
      maxPages: 1,
    },
  });

  const crawlMode = watch('crawlMode');

  useEffect(() => {
    let active = true;
    setLoadingBots(true);
    chatbotService
      .listChatbots({ page: 1, pageSize: 50 })
      .then((res) => {
        if (!active) return;
        const bots = res.items || [];
        setChatbots(bots);
        if (bots.length > 0) {
          const matched = bots.find((b) => b.chatbotId === Number(initialChatbotParam));
          setSelectedChatbotId(matched ? matched.chatbotId : bots[0].chatbotId);
        }
      })
      .catch((err) => {
        if (active) setError(extractApiError(err, 'Unable to load chatbots.'));
      })
      .finally(() => {
        if (active) setLoadingBots(false);
      });
    return () => {
      active = false;
    };
  }, [initialChatbotParam]);

  const loadWebsites = useCallback(async () => {
    if (!selectedChatbotId) return;
    setLoadingList(true);
    try {
      const data = await knowledgeService.listSources(selectedChatbotId, {
        type: 'URL',
        page: 1,
        pageSize: 50,
      });
      setItems(data.items || []);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load website sources.'));
    } finally {
      setLoadingList(false);
    }
  }, [selectedChatbotId]);

  useEffect(() => {
    loadWebsites();
  }, [loadWebsites]);

  const onSubmit = async (values) => {
    if (!selectedChatbotId) return;
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.ingestWebsite(selectedChatbotId, {
        url: values.url.trim(),
        title: values.title?.trim() || undefined,
        crawlMode: values.crawlMode,
        maxPages: values.crawlMode === 'crawl' ? Number(values.maxPages) : 1,
      });
      setFeedback(res.message || 'Website indexed successfully.');
      reset({ url: '', title: '', crawlMode: 'single', maxPages: 1 });
      await loadWebsites();
    } catch (err) {
      setError(extractApiError(err, 'Failed to ingest website URL.'));
      await loadWebsites();
    }
  };

  const handleRecrawl = async (sourceId) => {
    setReindexingId(sourceId);
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.reindexSource(selectedChatbotId, sourceId, true);
      setFeedback(res.message || 'Website re-crawled and indexed.');
      await loadWebsites();
    } catch (err) {
      setError(extractApiError(err, 'Failed to re-crawl website URL.'));
    } finally {
      setReindexingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setMutating(true);
    setError('');
    try {
      await knowledgeService.deleteSource(selectedChatbotId, deleteTarget.sourceId);
      setDeleteTarget(null);
      setFeedback('Website source and vector chunks deleted.');
      await loadWebsites();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete website source.'));
      setDeleteTarget(null);
    } finally {
      setMutating(false);
    }
  };

  if (!loadingBots && chatbots.length === 0) {
    return (
      <Paper sx={{ p: 4, maxWidth: 680 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          No Chatbots Found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create a chatbot before adding website knowledge sources.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/app/chatbots/new')}>
          Create First Chatbot
        </Button>
      </Paper>
    );
  }

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
          <Typography variant="h4">Website Sources</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Ingest public web pages or same-origin documentation sections into searchable RAG chunks.
          </Typography>
        </Box>

        <TextField
          select
          size="small"
          label="Target Chatbot"
          value={selectedChatbotId}
          onChange={(e) => {
            const nextId = Number(e.target.value);
            setSelectedChatbotId(nextId);
            setSearchParams({ chatbotId: String(nextId) });
          }}
          sx={{ minWidth: 230 }}
        >
          {chatbots.map((b) => (
            <MenuItem key={b.chatbotId} value={b.chatbotId}>
              {b.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {feedback ? <Alert severity="success">{feedback}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Add Website Source
        </Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Grid container spacing={2.25}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Public Website URL"
                placeholder="https://example.com/pricing"
                fullWidth
                size="small"
                {...register('url')}
                error={Boolean(errors.url)}
                helperText={errors.url?.message || 'Only public http:// and https:// endpoints are accepted.'}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Display Title (Optional)"
                placeholder="Pricing & Plans Page"
                fullWidth
                size="small"
                {...register('title')}
                error={Boolean(errors.title)}
                helperText={errors.title?.message || 'Defaults to the extracted HTML page title.'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Controller
                name="crawlMode"
                control={control}
                render={({ field }) => (
                  <TextField select fullWidth size="small" label="Crawl Mode" {...field}>
                    <MenuItem value="single">Single Page Only</MenuItem>
                    <MenuItem value="crawl">Crawl Same-Origin Links</MenuItem>
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Max Pages"
                type="number"
                size="small"
                fullWidth
                disabled={crawlMode !== 'crawl'}
                {...register('maxPages')}
                error={Boolean(errors.maxPages)}
                helperText={errors.maxPages?.message || 'Up to 10 pages per crawl job.'}
                slotProps={{ htmlInput: { min: 1, max: 10 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Button
                type="submit"
                variant="contained"
                startIcon={<LanguageOutlinedIcon />}
                disabled={isSubmitting || !selectedChatbotId}
                fullWidth
                sx={{ height: 40 }}
              >
                {isSubmitting ? 'Crawling & Indexing...' : 'Fetch & Index Website'}
              </Button>
            </Grid>
          </Grid>

          {isSubmitting ? (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                Fetching clean page text, splitting chunks, and computing Gemini embeddings...
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Indexed Website Pages
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title & URL</TableCell>
                <TableCell align="right">Chunks</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Crawled</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingList ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No website pages indexed for this chatbot yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((site) => (
                  <TableRow key={site.sourceId} hover>
                    <TableCell sx={{ maxWidth: 380 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {site.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {site.sourceUri}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatNumber(site.chunkCount)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatNumber(site.totalTokens)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={site.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateShort(site.lastIndexedOn || site.createdOn)}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Inspect chunks">
                          <IconButton size="small" onClick={() => setInspectSourceId(site.sourceId)}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Re-crawl & re-index">
                          <IconButton
                            size="small"
                            disabled={reindexingId === site.sourceId}
                            onClick={() => handleRecrawl(site.sourceId)}
                          >
                            <RefreshOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(site)}>
                            <DeleteOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <SourceChunksDialog
        open={Boolean(inspectSourceId)}
        chatbotId={selectedChatbotId}
        sourceId={inspectSourceId}
        onClose={() => setInspectSourceId(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This removes the crawled webpage and all associated vector chunks from this chatbot."
        confirmLabel="Delete Website"
        confirmColor="error"
        loading={mutating}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
