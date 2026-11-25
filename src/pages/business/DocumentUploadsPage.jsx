import { useCallback, useEffect, useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { SourceChunksDialog } from '../../components/knowledge/SourceChunksDialog';
import { chatbotService } from '../../services/chatbotService';
import { knowledgeService } from '../../services/knowledgeService';
import { extractApiError, formatDateShort, formatNumber } from '../../utils/formatters';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentUploadsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialChatbotParam = Number(searchParams.get('chatbotId')) || '';

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(initialChatbotParam);
  const [loadingBots, setLoadingBots] = useState(true);

  const [selectedFile, setSelectedFile] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [inspectSourceId, setInspectSourceId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutating, setMutating] = useState(false);
  const [reindexingId, setReindexingId] = useState(null);

  const fileInputRef = useRef(null);

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

  const loadDocuments = useCallback(async () => {
    if (!selectedChatbotId) return;
    setLoadingList(true);
    try {
      const data = await knowledgeService.listSources(selectedChatbotId, {
        type: 'Documents',
        page: 1,
        pageSize: 50,
      });
      setItems(data.items || []);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load uploaded documents.'));
    } finally {
      setLoadingList(false);
    }
  }, [selectedChatbotId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const validateAndStageFile = (file) => {
    setError('');
    setFeedback('');
    if (!file) return;
    const lower = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!hasAllowedExt) {
      setError('Unsupported file format. Please upload PDF, DOCX, TXT, or MD files.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File exceeds the 10 MB maximum size limit.');
      return;
    }
    setSelectedFile(file);
    if (!customTitle.trim()) {
      setCustomTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !selectedChatbotId || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.uploadDocument(
        selectedChatbotId,
        selectedFile,
        customTitle,
        setUploadProgress
      );
      setFeedback(res.message || 'Document uploaded and indexed successfully.');
      setSelectedFile(null);
      setCustomTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (err) {
      setError(extractApiError(err, 'Document upload failed.'));
      await loadDocuments();
    } finally {
      setUploading(false);
    }
  };

  const handleReindex = async (sourceId) => {
    setReindexingId(sourceId);
    setError('');
    setFeedback('');
    try {
      const res = await knowledgeService.reindexSource(selectedChatbotId, sourceId);
      setFeedback(res.message || 'Document re-indexed.');
      await loadDocuments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to re-index document.'));
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
      setFeedback('Document and vector chunks deleted.');
      await loadDocuments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete document.'));
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
          Create a chatbot first before uploading business documents.
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
          <Typography variant="h4">Document Uploads</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Upload PDF, DOCX, TXT, or Markdown files up to 10 MB for automatic extraction, chunking, and Gemini embeddings.
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
        <Box component="form" onSubmit={handleUploadSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.[0]) {
                validateAndStageFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              p: 4,
              border: '1px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              bgcolor: dragActive ? 'action.hover' : 'background.default',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              hidden
              onChange={(e) => validateAndStageFile(e.target.files?.[0])}
            />
            <CloudUploadOutlinedIcon sx={{ fontSize: 34, color: 'primary.main', mb: 1 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {selectedFile ? selectedFile.name : 'Click to choose or drag and drop a file'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · Ready to extract and index`
                : 'Supported formats: .pdf, .docx, .txt, .md · Max size 10 MB'}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField
              size="small"
              label="Document Title (Optional)"
              placeholder="e.g., 2026 Product Return Policy"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!selectedFile || uploading || !selectedChatbotId}
              sx={{ minWidth: 210, height: 40 }}
            >
              {uploading ? 'Indexing Document...' : 'Upload & Index'}
            </Button>
          </Stack>

          {uploading ? (
            <Box>
              <LinearProgress
                variant={uploadProgress > 0 && uploadProgress < 100 ? 'determinate' : 'indeterminate'}
                value={uploadProgress}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                Extracting text, splitting chunks, and generating Gemini embeddings...
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Uploaded Documents
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Document</TableCell>
                <TableCell>Format</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell align="right">Chunks</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingList ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No documents uploaded for this chatbot yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((doc) => (
                  <TableRow key={doc.sourceId} hover>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {doc.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {doc.fileName || 'Document'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {doc.sourceType}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatBytes(doc.fileSizeBytes)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular-nums"
                      sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {formatNumber(doc.chunkCount)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={doc.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateShort(doc.createdOn)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Inspect chunks">
                          <IconButton size="small" onClick={() => setInspectSourceId(doc.sourceId)}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Re-index">
                          <IconButton
                            size="small"
                            disabled={reindexingId === doc.sourceId}
                            onClick={() => handleReindex(doc.sourceId)}
                          >
                            <RefreshOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(doc)}>
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
        description="This permanently removes the document and its indexed vector chunks."
        confirmLabel="Delete Document"
        confirmColor="error"
        loading={mutating}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
