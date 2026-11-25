import { useCallback, useEffect, useState } from 'react';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { SourceChunksDialog } from '../../components/knowledge/SourceChunksDialog';
import { chatbotService } from '../../services/chatbotService';
import { knowledgeService } from '../../services/knowledgeService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatbotParam = Number(searchParams.get('chatbotId')) || '';

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(initialChatbotParam);
  const [loadingBots, setLoadingBots] = useState(true);

  const [tab, setTab] = useState(0); // 0 = All Sources, 1 = Semantic Retrieval Test
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    totalSources: 0,
    indexedSources: 0,
    processingSources: 0,
    failedSources: 0,
    totalChunks: 0,
    totalTokens: 0,
  });

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [inspectSourceId, setInspectSourceId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutating, setMutating] = useState(false);
  const [reindexingId, setReindexingId] = useState(null);

  // Retrieval test state
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [searchingVectors, setSearchingVectors] = useState(false);
  const [retrievalMatches, setRetrievalMatches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const pageSize = 15;

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
          const validParam = bots.find((b) => b.chatbotId === Number(initialChatbotParam));
          const nextId = validParam ? validParam.chatbotId : bots[0].chatbotId;
          setSelectedChatbotId(nextId);
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

  const loadSources = useCallback(async () => {
    if (!selectedChatbotId) return;
    setLoadingSources(true);
    setError('');
    try {
      const data = await knowledgeService.listSources(selectedChatbotId, {
        search,
        type: typeFilter,
        status: statusFilter,
        page,
        pageSize,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load knowledge sources.'));
    } finally {
      setLoadingSources(false);
    }
  }, [selectedChatbotId, search, typeFilter, statusFilter, page]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleSelectChatbot = (nextId) => {
    setSelectedChatbotId(nextId);
    setPage(1);
    setSearchParams({ chatbotId: String(nextId) });
    setRetrievalMatches([]);
    setHasSearched(false);
    setFeedback('');
  };

  const handleReindex = async (source) => {
    setReindexingId(source.sourceId);
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.reindexSource(selectedChatbotId, source.sourceId, source.sourceType === 'URL');
      setFeedback(res.message || 'Source re-indexed.');
      await loadSources();
    } catch (err) {
      setError(extractApiError(err, 'Re-indexing failed.'));
    } finally {
      setReindexingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setMutating(true);
    setError('');
    setFeedback('');
    try {
      await knowledgeService.deleteSource(selectedChatbotId, deleteTarget.sourceId);
      setDeleteTarget(null);
      setFeedback(`Deleted "${deleteTarget.title}" and its vector chunks.`);
      await loadSources();
    } catch (err) {
      setError(extractApiError(err, 'Unable to delete knowledge source.'));
      setDeleteTarget(null);
    } finally {
      setMutating(false);
    }
  };

  const handleRunRetrievalSearch = async (e) => {
    e.preventDefault();
    const q = retrievalQuery.trim();
    if (!q || !selectedChatbotId) return;
    setSearchingVectors(true);
    setError('');
    try {
      const data = await knowledgeService.searchKnowledge(selectedChatbotId, q, 6);
      setRetrievalMatches(data.matches || []);
      setHasSearched(true);
    } catch (err) {
      setError(extractApiError(err, 'Failed to query vector index.'));
    } finally {
      setSearchingVectors(false);
    }
  };

  if (!loadingBots && chatbots.length === 0) {
    return (
      <Paper sx={{ p: 4, maxWidth: 680 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Create a Chatbot Before Adding Knowledge
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Knowledge documents, websites, and FAQs are isolated per chatbot so each assistant retrieves only its own domain content.
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
          <Typography variant="h4">Knowledge Base & RAG Index</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Monitor indexed documents, websites, FAQs, vector chunk counts, and semantic retrieval accuracy.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.25} flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Active Chatbot"
            value={selectedChatbotId}
            onChange={(e) => handleSelectChatbot(Number(e.target.value))}
            sx={{ minWidth: 230 }}
          >
            {chatbots.map((b) => (
              <MenuItem key={b.chatbotId} value={b.chatbotId}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>

          {selectedChatbotId ? (
            <Button
              variant="outlined"
              startIcon={<PlayArrowOutlinedIcon />}
              onClick={() => navigate(`/app/chatbots/${selectedChatbotId}/playground`)}
            >
              Test in Playground
            </Button>
          ) : null}
        </Stack>
      </Box>

      {/* Quick Navigation Strip to Specialized Ingestion Tools */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<DescriptionOutlinedIcon />}
          onClick={() => navigate(`/app/sources/documents?chatbotId=${selectedChatbotId}`)}
        >
          Upload Documents
        </Button>
        <Button
          variant="outlined"
          startIcon={<LanguageOutlinedIcon />}
          onClick={() => navigate(`/app/sources/websites?chatbotId=${selectedChatbotId}`)}
        >
          Add Website URL
        </Button>
        <Button
          variant="outlined"
          startIcon={<QuizOutlinedIcon />}
          onClick={() => navigate(`/app/sources/faqs?chatbotId=${selectedChatbotId}`)}
        >
          Manage FAQs & Text
        </Button>
      </Stack>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Total Sources"
            value={formatNumber(stats.totalSources)}
            helperText={`${formatNumber(stats.indexedSources)} indexed · ${formatNumber(stats.failedSources)} failed`}
            loading={loadingSources && items.length === 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Indexed Sources"
            value={formatNumber(stats.indexedSources)}
            helperText="Ready for RAG retrieval"
            loading={loadingSources && items.length === 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Vector Chunks"
            value={formatNumber(stats.totalChunks)}
            helperText="Embedded with gemini-embedding-2"
            loading={loadingSources && items.length === 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Indexed Tokens"
            value={formatNumber(stats.totalTokens)}
            helperText="Estimated chunk corpus size"
            loading={loadingSources && items.length === 0}
          />
        </Grid>
      </Grid>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {feedback ? <Alert severity="success">{feedback}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
        >
          <Tab label="Indexed Knowledge Sources" />
          <Tab label="Retrieval Inspector (Vector Search)" />
        </Tabs>

        {tab === 0 ? (
          <>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              sx={{ mb: 3 }}
              justifyContent="space-between"
            >
              <TextField
                size="small"
                placeholder="Search title, URL, filename, or question..."
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                sx={{ minWidth: { md: 320 } }}
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

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  size="small"
                  label="Source Type"
                  value={typeFilter}
                  onChange={(e) => {
                    setPage(1);
                    setTypeFilter(e.target.value);
                  }}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="All">All Types</MenuItem>
                  <MenuItem value="PDF">PDF</MenuItem>
                  <MenuItem value="DOCX">DOCX</MenuItem>
                  <MenuItem value="TXT">TXT / MD</MenuItem>
                  <MenuItem value="URL">Website URL</MenuItem>
                  <MenuItem value="FAQ">FAQ</MenuItem>
                  <MenuItem value="Manual">Manual Text</MenuItem>
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1);
                    setStatusFilter(e.target.value);
                  }}
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="All">All Statuses</MenuItem>
                  <MenuItem value="Indexed">Indexed</MenuItem>
                  <MenuItem value="Processing">Processing</MenuItem>
                  <MenuItem value="Failed">Failed</MenuItem>
                </TextField>
              </Stack>
            </Stack>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Source</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Chunks</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Indexed On</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingSources ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Skeleton height={44} />
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.75 }}>
                          No knowledge sources indexed yet
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Upload documents, ingest public web pages, or add curated FAQs to ground this chatbot&apos;s answers.
                        </Typography>
                        <Button
                          variant="contained"
                          onClick={() => navigate(`/app/sources/documents?chatbotId=${selectedChatbotId}`)}
                        >
                          Upload First Document
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((src) => (
                      <TableRow key={src.sourceId} hover>
                        <TableCell sx={{ maxWidth: 340 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {src.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            {src.sourceUri || src.fileName || src.faqQuestion || 'Knowledge entry'}
                          </Typography>
                          {src.errorMessage ? (
                            <Typography variant="caption" color="error.main" noWrap sx={{ display: 'block' }}>
                              {src.errorMessage}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell
                          sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
                        >
                          {src.sourceType}
                        </TableCell>
                        <TableCell
                          align="right"
                          className="tabular-nums"
                          sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatNumber(src.chunkCount)}
                        </TableCell>
                        <TableCell
                          align="right"
                          className="tabular-nums"
                          sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatNumber(src.totalTokens)}
                        </TableCell>
                        <TableCell>
                          <StatusText status={src.status} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatDateShort(src.lastIndexedOn || src.createdOn)}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Inspect chunks">
                              <IconButton
                                size="small"
                                aria-label={`Inspect ${src.title}`}
                                onClick={() => setInspectSourceId(src.sourceId)}
                              >
                                <VisibilityOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Re-index embeddings">
                              <IconButton
                                size="small"
                                aria-label={`Re-index ${src.title}`}
                                disabled={reindexingId === src.sourceId}
                                onClick={() => handleReindex(src)}
                              >
                                <RefreshOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete source">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete ${src.title}`}
                                onClick={() => setDeleteTarget(src)}
                              >
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
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              Run a semantic vector query against this chatbot&apos;s indexed chunks to verify retrieval scores before testing in the Gemini Playground.
            </Typography>

            <Box
              component="form"
              onSubmit={handleRunRetrievalSearch}
              sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}
            >
              <TextField
                fullWidth
                size="small"
                label="Test Search Query"
                placeholder="e.g., What is your enterprise SLA and refund policy?"
                value={retrievalQuery}
                onChange={(e) => setRetrievalQuery(e.target.value)}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={searchingVectors || !retrievalQuery.trim()}
                sx={{ minWidth: 180 }}
              >
                {searchingVectors ? 'Searching...' : 'Search Chunks'}
              </Button>
            </Box>

            {hasSearched && retrievalMatches.length === 0 ? (
              <Alert severity="info">
                No indexed chunks matched above the similarity threshold for this query.
              </Alert>
            ) : null}

            <Stack spacing={2}>
              {retrievalMatches.map((match, idx) => (
                <Box
                  key={match.chunkId}
                  sx={{
                    p: 2.25,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    bgcolor: 'background.default',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      #{idx + 1} · {match.sourceTitle} ({match.sourceType})
                    </Typography>
                    <Typography
                      variant="caption"
                      color="primary.main"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
                    >
                      Similarity {(Number(match.score) * 100).toFixed(1)}% · Chunk #{match.chunkIndex + 1}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {match.content}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
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
        description="This permanently deletes the knowledge source and all associated vector chunks from this chatbot. This action cannot be undone."
        confirmLabel="Delete Source"
        confirmColor="error"
        loading={mutating}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </Box>
  );
}
