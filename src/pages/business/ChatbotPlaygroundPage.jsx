import { useCallback, useEffect, useRef, useState } from 'react';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Skeleton,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { chatbotService } from '../../services/chatbotService';
import { extractApiError, formatNumber } from '../../utils/formatters';

export function ChatbotPlaygroundPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(id ? Number(id) : '');
  const [activeBot, setActiveBot] = useState(null);
  const [models, setModels] = useState([
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Balanced)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)' },
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon (Advanced Reasoning)' },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep Reasoning)' },
  ]);
  const [geminiConfigured, setGeminiConfigured] = useState(true);

  // Left-panel editable settings for testing before saving
  const [aiModel, setAiModel] = useState('gemini-4-hydrogen');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);
  const [useRag, setUseRag] = useState(true);

  // Right-panel temporary playground conversation state (separate from customer conversations)
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [chatError, setChatError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState({ type: '', text: '' });

  const messagesEndRef = useRef(null);
  const canEditConfig = user?.role === 'BusinessOwner' || user?.role === 'BusinessAdmin';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const loadSelectedBot = useCallback(async (botId) => {
    if (!botId) {
      setActiveBot(null);
      return;
    }
    const detail = await chatbotService.getChatbot(botId);
    setActiveBot(detail);
    setAiModel(detail.aiModel || 'gemini-4-hydrogen');
    setSystemInstructions(detail.systemInstructions || '');
    setTemperature(Number(detail.temperature ?? 0.7));
    setMaxOutputTokens(Number(detail.maxOutputTokens ?? 2048));
    setChatError('');
    setSaveFeedback({ type: '', text: '' });

    const welcome =
      detail.welcomeMessage ||
      `Hello! I am ${detail.name}. Send a test message below to evaluate my Gemini responses.`;
    setMessages([
      {
        id: `welcome-${detail.chatbotId}`,
        role: 'model',
        content: welcome,
        isWelcome: true,
      },
    ]);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingInit(true);
      try {
        const [provData, listData] = await Promise.all([
          chatbotService.listProviders(),
          chatbotService.listChatbots({ page: 1, pageSize: 50 }),
        ]);
        if (!active) return;

        const geminiProvider = provData?.providers?.find((p) => p.code === 'GOOGLE_GEMINI');
        if (geminiProvider?.models?.length) setModels(geminiProvider.models);
        setGeminiConfigured(Boolean(provData?.geminiConfigured));

        const items = listData?.items || [];
        setChatbots(items);

        const initialId = id ? Number(id) : items[0]?.chatbotId;
        if (initialId) {
          setSelectedChatbotId(initialId);
          await loadSelectedBot(initialId);
        }
      } catch (err) {
        if (active) setChatError(extractApiError(err, 'Unable to initialize playground.'));
      } finally {
        if (active) setLoadingInit(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, loadSelectedBot]);

  const handleSelectChatbot = async (nextId) => {
    setSelectedChatbotId(nextId);
    try {
      await loadSelectedBot(nextId);
    } catch (err) {
      setChatError(extractApiError(err, 'Unable to load selected chatbot.'));
    }
  };

  const handleSaveConfiguration = async () => {
    if (!activeBot) return;
    setSavingConfig(true);
    setSaveFeedback({ type: '', text: '' });
    try {
      const updated = await chatbotService.updateConfiguration(activeBot.chatbotId, {
        name: activeBot.name,
        description: activeBot.description,
        businessName: activeBot.businessName,
        websiteUrl: activeBot.websiteUrl,
        isEnabled: activeBot.isEnabled,
        aiProvider: activeBot.aiProvider,
        aiModel,
        systemInstructions,
        temperature: Number(temperature),
        maxOutputTokens: Number(maxOutputTokens),
        responseLanguage: activeBot.responseLanguage,
        responseTone: activeBot.responseTone,
        personality: activeBot.personality,
        welcomeMessage: activeBot.welcomeMessage,
        fallbackMessage: activeBot.fallbackMessage,
        enableConversationHistory: activeBot.enableConversationHistory,
        enableHumanHandover: activeBot.enableHumanHandover,
        enableFollowUpQuestions: activeBot.enableFollowUpQuestions,
      });
      setActiveBot(updated);
      setSaveFeedback({ type: 'success', text: 'Configuration saved to database.' });
    } catch (err) {
      setSaveFeedback({ type: 'error', text: extractApiError(err, 'Failed to save configuration.') });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleClearConversation = () => {
    setChatError('');
    if (!activeBot) {
      setMessages([]);
      return;
    }
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        content:
          activeBot.welcomeMessage ||
          `Hello! I am ${activeBot.name}. Send a test message below to evaluate my Gemini responses.`,
        isWelcome: true,
      },
    ]);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || !activeBot || sending) return;

    setChatError('');
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const historyForApi = messages
      .filter((m) => !m.isWelcome)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    setSending(true);

    try {
      const res = await chatbotService.sendPlaygroundMessage(activeBot.chatbotId, {
        message: text,
        history: historyForApi,
        aiModel,
        systemInstructions,
        temperature: Number(temperature),
        maxOutputTokens: Number(maxOutputTokens),
        useRag,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          content: res.reply,
          model: res.model,
          responseTimeMs: res.responseTimeMs,
          usage: res.usage,
          rag: res.rag,
        },
      ]);
    } catch (err) {
      setChatError(extractApiError(err, 'Failed to receive Gemini response.'));
    } finally {
      setSending(false);
    }
  };

  if (!loadingInit && chatbots.length === 0) {
    return (
      <Paper sx={{ p: 4, maxWidth: 680 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Create a Chatbot to Open the Playground
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          No chatbots have been created in your business workspace yet. Create one first to test Gemini models and system instructions.
        </Typography>
        {canEditConfig ? (
          <Button variant="contained" onClick={() => navigate('/app/chatbots/new')}>
            Create First Chatbot
          </Button>
        ) : null}
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
          <Typography variant="h4">Gemini Testing Playground</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Test instructions, models, and tone in a temporary session isolated from live customer conversations.
          </Typography>
        </Box>

        {activeBot && canEditConfig ? (
          <Button
            variant="outlined"
            startIcon={<SettingsOutlinedIcon />}
            onClick={() => navigate(`/app/chatbots/${activeBot.chatbotId}/configure`)}
          >
            Full Configuration
          </Button>
        ) : null}
      </Box>

      {!geminiConfigured ? (
        <Alert severity="warning">
          GEMINI_API_KEY is not configured on the server. Add your key in Settings &gt; Secrets to run live Gemini completions.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '4fr 8fr' },
          gap: 3,
          alignItems: 'stretch',
        }}
      >
        {/* Left Panel: Chatbot & AI Parameter Controls */}
        <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
          {loadingInit ? (
            <Stack spacing={2}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={140} />
            </Stack>
          ) : (
            <>
              <TextField
                select
                label="Chatbot"
                fullWidth
                value={selectedChatbotId}
                onChange={(e) => handleSelectChatbot(Number(e.target.value))}
              >
                {chatbots.map((bot) => (
                  <MenuItem key={bot.chatbotId} value={bot.chatbotId}>
                    {bot.name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="AI Model"
                fullWidth
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              >
                {models.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="System Instructions"
                fullWidth
                multiline
                rows={6}
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                placeholder="Guide the chatbot's domain rules, tone, and constraints..."
              />

              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Temperature
                  </Typography>
                  <Typography
                    variant="body2"
                    className="tabular-nums"
                    sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {Number(temperature).toFixed(1)}
                  </Typography>
                </Box>
                <Slider
                  value={Number(temperature)}
                  onChange={(_, v) => setTemperature(Number(v))}
                  min={0}
                  max={2}
                  step={0.1}
                  valueLabelDisplay="auto"
                />
              </Box>

              <TextField
                label="Maximum Output Tokens"
                type="number"
                fullWidth
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                slotProps={{ htmlInput: { min: 128, max: 8192, step: 64 } }}
              />

              <Box
                sx={{
                  p: 1.75,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.default',
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={useRag}
                      onChange={(e) => setUseRag(e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Use Knowledge Base (RAG)
                    </Typography>
                  }
                />
                <Typography variant="caption" color="text.secondary" className="tabular-nums" sx={{ display: 'block', mt: 0.25 }}>
                  {formatNumber(activeBot?.indexedChunkCount || 0)} indexed chunks available for retrieval
                </Typography>
                {canEditConfig && activeBot ? (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<MenuBookOutlinedIcon />}
                    onClick={() => navigate(`/app/knowledge?chatbotId=${activeBot.chatbotId}`)}
                    sx={{ mt: 0.5, px: 0 }}
                  >
                    Manage Knowledge Sources
                  </Button>
                ) : null}
              </Box>

              {saveFeedback.text ? (
                <Alert severity={saveFeedback.type}>{saveFeedback.text}</Alert>
              ) : null}

              {canEditConfig ? (
                <Button
                  variant="contained"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={handleSaveConfiguration}
                  disabled={savingConfig || !activeBot}
                  fullWidth
                >
                  {savingConfig ? 'Saving Configuration...' : 'Save Configuration'}
                </Button>
              ) : null}
            </>
          )}
        </Paper>

        {/* Right Panel: Interactive Chat Playground */}
        <Paper
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 580,
            maxHeight: { lg: 680 },
            overflow: 'hidden',
          }}
        >
          {/* Chat Header */}
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                {activeBot?.name || 'Playground'}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "'JetBrains Mono', monospace", display: 'block' }}
                noWrap
              >
                {aiModel} · Temporary test session
              </Typography>
            </Box>

            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<DeleteSweepOutlinedIcon />}
              onClick={handleClearConversation}
              disabled={sending}
            >
              Clear Conversation
            </Button>
          </Box>

          {/* Messages Viewport */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              bgcolor: 'background.default',
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <Box
                  key={msg.id}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: '82%',
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: isUser ? 'primary.main' : 'background.paper',
                      color: isUser ? 'primary.contrastText' : 'text.primary',
                      border: isUser ? 'none' : 1,
                      borderColor: 'divider',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                      {msg.content}
                    </Typography>
                  </Box>

                  {!isUser && !msg.isWelcome ? (
                    <Box sx={{ mt: 0.5, maxWidth: '82%' }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        className="tabular-nums"
                        sx={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '0.72rem',
                          display: 'block',
                        }}
                      >
                        {msg.model} · {formatNumber(msg.responseTimeMs)} ms
                        {msg.usage?.totalTokens
                          ? ` · ${formatNumber(msg.usage.totalTokens)} tokens (${formatNumber(msg.usage.promptTokens)} in / ${formatNumber(msg.usage.outputTokens)} out)`
                          : ''}
                        {msg.rag?.retrievedCount
                          ? ` · ${msg.rag.retrievedCount} RAG source${msg.rag.retrievedCount === 1 ? '' : 's'}`
                          : ''}
                      </Typography>

                      {msg.rag?.citations?.length ? (
                        <Box
                          sx={{
                            mt: 0.75,
                            px: 1.5,
                            py: 1,
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1.25,
                            bgcolor: 'background.paper',
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                            Grounded Knowledge Sources
                          </Typography>
                          {msg.rag.citations.map((cit) => (
                            <Typography
                              key={cit.chunkId}
                              variant="caption"
                              color="text.secondary"
                              className="tabular-nums"
                              sx={{ display: 'block', lineHeight: 1.5 }}
                            >
                              {cit.sourceTitle} ({cit.sourceType}) · Chunk #{cit.chunkIndex + 1} · {(Number(cit.score) * 100).toFixed(0)}% match
                            </Typography>
                          ))}
                        </Box>
                      ) : null}
                    </Box>
                  ) : null}
                </Box>
              );
            })}

            {sending ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Generating Gemini response...
                </Typography>
              </Box>
            ) : null}

            <div ref={messagesEndRef} />
          </Box>

          {chatError ? (
            <Alert severity="error" sx={{ borderRadius: 0 }}>
              {chatError}
            </Alert>
          ) : null}

          <Divider />

          {/* Input Bar */}
          <Box
            component="form"
            onSubmit={handleSendMessage}
            sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-end', bgcolor: 'background.paper' }}
          >
            <TextField
              fullWidth
              multiline
              maxRows={4}
              size="small"
              placeholder="Ask a test question to evaluate your chatbot..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={sending || !activeBot}
            />
            <Button
              type="submit"
              variant="contained"
              endIcon={<SendOutlinedIcon />}
              disabled={sending || !draft.trim() || !activeBot}
              sx={{ minHeight: 40 }}
            >
              Send
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
