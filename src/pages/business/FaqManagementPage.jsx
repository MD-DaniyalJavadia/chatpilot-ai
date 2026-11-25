import { useCallback, useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
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
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { SourceChunksDialog } from '../../components/knowledge/SourceChunksDialog';
import { chatbotService } from '../../services/chatbotService';
import { knowledgeService } from '../../services/knowledgeService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';
import { faqSourceSchema, manualSourceSchema } from '../../validations/knowledgeSchemas';

export function FaqManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatbotParam = Number(searchParams.get('chatbotId')) || '';

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(initialChatbotParam);
  const [loadingBots, setLoadingBots] = useState(true);

  const [entryMode, setEntryMode] = useState(0); // 0 = FAQ Pair, 1 = Manual Knowledge Text
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [inspectSourceId, setInspectSourceId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutating, setMutating] = useState(false);

  // Edit Dialog state
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', question: '', answer: '', content: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const faqForm = useForm({
    resolver: yupResolver(faqSourceSchema),
    defaultValues: { title: '', question: '', answer: '' },
  });

  const manualForm = useForm({
    resolver: yupResolver(manualSourceSchema),
    defaultValues: { title: '', content: '' },
  });

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

  const loadEntries = useCallback(async () => {
    if (!selectedChatbotId) return;
    setLoadingList(true);
    try {
      const [faqRes, manualRes] = await Promise.all([
        knowledgeService.listSources(selectedChatbotId, { type: 'FAQ', page: 1, pageSize: 50 }),
        knowledgeService.listSources(selectedChatbotId, { type: 'Manual', page: 1, pageSize: 50 }),
      ]);
      const combined = [...(faqRes.items || []), ...(manualRes.items || [])].sort(
        (a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
      );
      setItems(combined);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load FAQ and manual entries.'));
    } finally {
      setLoadingList(false);
    }
  }, [selectedChatbotId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const onCreateFaq = async (values) => {
    if (!selectedChatbotId) return;
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.createFaq(selectedChatbotId, {
        title: values.title?.trim() || undefined,
        question: values.question.trim(),
        answer: values.answer.trim(),
      });
      setFeedback(res.message || 'FAQ added and indexed.');
      faqForm.reset({ title: '', question: '', answer: '' });
      await loadEntries();
    } catch (err) {
      setError(extractApiError(err, 'Failed to add FAQ.'));
    }
  };

  const onCreateManual = async (values) => {
    if (!selectedChatbotId) return;
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.createManual(selectedChatbotId, {
        title: values.title.trim(),
        content: values.content.trim(),
      });
      setFeedback(res.message || 'Manual knowledge entry indexed.');
      manualForm.reset({ title: '', content: '' });
      await loadEntries();
    } catch (err) {
      setError(extractApiError(err, 'Failed to add manual knowledge entry.'));
    }
  };

  const openEditDialog = async (entry) => {
    setError('');
    setFeedback('');
    try {
      const detail = await knowledgeService.getSourceDetail(selectedChatbotId, entry.sourceId);
      setEditTarget(detail);
      setEditForm({
        title: detail.title || '',
        question: detail.faqQuestion || '',
        answer: detail.faqAnswer || '',
        content: detail.rawText || '',
      });
    } catch (err) {
      setError(extractApiError(err, 'Unable to load entry for editing.'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    setError('');
    try {
      const payload =
        editTarget.sourceType === 'FAQ'
          ? {
              title: editForm.title.trim() || undefined,
              question: editForm.question.trim(),
              answer: editForm.answer.trim(),
            }
          : {
              title: editForm.title.trim(),
              content: editForm.content.trim(),
            };
      const res = await knowledgeService.updateSourceContent(
        selectedChatbotId,
        editTarget.sourceId,
        payload
      );
      setEditTarget(null);
      setFeedback(res.message || 'Entry updated and re-indexed.');
      await loadEntries();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update knowledge entry.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setMutating(true);
    setError('');
    try {
      await knowledgeService.deleteSource(selectedChatbotId, deleteTarget.sourceId);
      setDeleteTarget(null);
      setFeedback('Knowledge entry deleted.');
      await loadEntries();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete entry.'));
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
          Create a chatbot before adding FAQs or manual knowledge articles.
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
          <Typography variant="h4">FAQ & Manual Knowledge</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Author curated Q&A pairs and business policy articles embedded directly for precision retrieval.
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
        <Tabs
          value={entryMode}
          onChange={(_, v) => setEntryMode(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
        >
          <Tab label="Add FAQ Question & Answer" />
          <Tab label="Add Manual Knowledge Article" />
        </Tabs>

        {entryMode === 0 ? (
          <Box
            component="form"
            onSubmit={faqForm.handleSubmit(onCreateFaq)}
            noValidate
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <TextField
              label="Question"
              placeholder="e.g., What are your customer support hours?"
              fullWidth
              size="small"
              {...faqForm.register('question')}
              error={Boolean(faqForm.formState.errors.question)}
              helperText={faqForm.formState.errors.question?.message}
            />
            <TextField
              label="Answer"
              placeholder="Provide a clear, complete answer customers should receive..."
              fullWidth
              multiline
              rows={4}
              {...faqForm.register('answer')}
              error={Boolean(faqForm.formState.errors.answer)}
              helperText={faqForm.formState.errors.answer?.message}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                startIcon={<AddOutlinedIcon />}
                disabled={faqForm.formState.isSubmitting || !selectedChatbotId}
              >
                {faqForm.formState.isSubmitting ? 'Indexing FAQ...' : 'Add & Index FAQ'}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box
            component="form"
            onSubmit={manualForm.handleSubmit(onCreateManual)}
            noValidate
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <TextField
              label="Article Title"
              placeholder="e.g., Enterprise Onboarding & SLA Policy"
              fullWidth
              size="small"
              {...manualForm.register('title')}
              error={Boolean(manualForm.formState.errors.title)}
              helperText={manualForm.formState.errors.title?.message}
            />
            <TextField
              label="Knowledge Content"
              placeholder="Paste policies, pricing tiers, troubleshooting steps, or product specs..."
              fullWidth
              multiline
              rows={6}
              {...manualForm.register('content')}
              error={Boolean(manualForm.formState.errors.content)}
              helperText={manualForm.formState.errors.content?.message}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                startIcon={<AddOutlinedIcon />}
                disabled={manualForm.formState.isSubmitting || !selectedChatbotId}
              >
                {manualForm.formState.isSubmitting ? 'Indexing Article...' : 'Save & Index Text'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Curated FAQs & Manual Entries
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Entry</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Chunks</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Updated</TableCell>
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
                      No FAQ pairs or manual articles added for this chatbot yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((entry) => (
                  <TableRow key={entry.sourceId} hover>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {entry.title}
                      </Typography>
                      {entry.faqAnswer ? (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {entry.faqAnswer}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {entry.sourceType}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatNumber(entry.chunkCount)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={entry.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateShort(entry.updatedOn || entry.createdOn)}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Inspect chunks">
                          <IconButton size="small" onClick={() => setInspectSourceId(entry.sourceId)}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit entry">
                          <IconButton size="small" onClick={() => openEditDialog(entry)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(entry)}>
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

      {/* Edit Dialog */}
      <Dialog open={Boolean(editTarget)} onClose={savingEdit ? undefined : () => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editTarget?.sourceType === 'FAQ' ? 'Edit FAQ Entry' : 'Edit Manual Knowledge'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {editTarget?.sourceType === 'FAQ' ? (
              <>
                <TextField
                  label="Question"
                  fullWidth
                  size="small"
                  value={editForm.question}
                  onChange={(e) => setEditForm((p) => ({ ...p, question: e.target.value }))}
                />
                <TextField
                  label="Answer"
                  fullWidth
                  multiline
                  rows={5}
                  value={editForm.answer}
                  onChange={(e) => setEditForm((p) => ({ ...p, answer: e.target.value }))}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Article Title"
                  fullWidth
                  size="small"
                  value={editForm.title}
                  onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                />
                <TextField
                  label="Knowledge Content"
                  fullWidth
                  multiline
                  rows={7}
                  value={editForm.content}
                  onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditTarget(null)} disabled={savingEdit} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} disabled={savingEdit} variant="contained">
            {savingEdit ? 'Re-indexing...' : 'Save & Re-index'}
          </Button>
        </DialogActions>
      </Dialog>

      <SourceChunksDialog
        open={Boolean(inspectSourceId)}
        chatbotId={selectedChatbotId}
        sourceId={inspectSourceId}
        onClose={() => setInspectSourceId(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This permanently deletes the entry and its indexed vector chunks."
        confirmLabel="Delete Entry"
        confirmColor="error"
        loading={mutating}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
