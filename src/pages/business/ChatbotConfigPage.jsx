import { useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Skeleton,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusText } from '../../components/common/StatusText';
import { chatbotService } from '../../services/chatbotService';
import { extractApiError } from '../../utils/formatters';
import { updateChatbotConfigSchema } from '../../validations/chatbotSchemas';

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese', 'Hindi'];
const TONES = ['Professional', 'Friendly', 'Concise', 'Empathetic', 'Consultative', 'Formal'];

export function ChatbotConfigPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chatbotsList, setChatbotsList] = useState([]);
  const [selectedId, setSelectedId] = useState(id ? Number(id) : null);
  const [providers, setProviders] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(updateChatbotConfigSchema),
    defaultValues: {
      name: '',
      description: '',
      businessName: '',
      websiteUrl: '',
      isEnabled: true,
      aiProvider: 'GOOGLE_GEMINI',
      aiModel: 'gemini-4-hydrogen',
      systemInstructions: '',
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseLanguage: 'English',
      responseTone: 'Professional',
      personality: '',
      welcomeMessage: '',
      fallbackMessage: '',
      enableConversationHistory: true,
      enableHumanHandover: false,
      enableFollowUpQuestions: true,
    },
  });

  useEffect(() => {
    setSelectedId(id ? Number(id) : null);
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setServerError('');
      try {
        const [provData, listData] = await Promise.all([
          chatbotService.listProviders(),
          chatbotService.listChatbots({ page: 1, pageSize: 50 }),
        ]);

        if (!active) return;
        setProviders(provData?.providers || []);
        const bots = listData?.items || [];
        setChatbotsList(bots);

        const targetId = id ? Number(id) : bots[0]?.chatbotId;
        if (targetId) {
          setSelectedId(targetId);
          const detail = await chatbotService.getChatbot(targetId);
          if (!active) return;
          reset({
            name: detail.name || '',
            description: detail.description || '',
            businessName: detail.businessName || '',
            websiteUrl: detail.websiteUrl || '',
            isEnabled: Boolean(detail.isEnabled),
            aiProvider: detail.aiProvider || 'GOOGLE_GEMINI',
            aiModel: detail.aiModel || 'gemini-4-hydrogen',
            systemInstructions: detail.systemInstructions || '',
            temperature: Number(detail.temperature ?? 0.7),
            maxOutputTokens: Number(detail.maxOutputTokens ?? 2048),
            responseLanguage: detail.responseLanguage || 'English',
            responseTone: detail.responseTone || 'Professional',
            personality: detail.personality || '',
            welcomeMessage: detail.welcomeMessage || '',
            fallbackMessage: detail.fallbackMessage || '',
            enableConversationHistory: Boolean(detail.enableConversationHistory),
            enableHumanHandover: Boolean(detail.enableHumanHandover),
            enableFollowUpQuestions: Boolean(detail.enableFollowUpQuestions),
          });
        }
      } catch (err) {
        if (active) setServerError(extractApiError(err, 'Unable to load chatbot configuration.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, reset]);

  const selectedProviderCode = watch('aiProvider');
  const activeProvider = providers.find((p) => p.code === selectedProviderCode);
  const availableModels = activeProvider?.models || [
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Balanced)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)' },
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon (Advanced Reasoning)' },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep Reasoning)' },
  ];

  const onSubmit = async (values) => {
    if (!selectedId) return;
    setServerError('');
    setSuccessMessage('');
    try {
      await chatbotService.updateConfiguration(selectedId, {
        ...values,
        websiteUrl: values.websiteUrl || null,
      });
      setSuccessMessage('Chatbot configuration saved.');
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to save chatbot configuration.'));
    }
  };

  const hasValidationErrors = Object.keys(errors).length > 0;

  if (!loading && !selectedId && chatbotsList.length === 0) {
    return (
      <Paper sx={{ p: 4, maxWidth: 680 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          No Chatbots Available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create your first chatbot before configuring AI models, instructions, and behavior settings.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/app/chatbots/new')}>
          Create Chatbot
        </Button>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 920 }}>
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
          <Typography variant="h4">Chatbot Configuration</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.75 }}>
            <Typography variant="body2" color="text.secondary">
              {watch('name') || 'Loading...'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ·
            </Typography>
            <StatusText status={watch('isEnabled') ? 'Active' : 'Inactive'} />
          </Box>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {!id && chatbotsList.length > 1 ? (
            <TextField
              select
              size="small"
              label="Select Chatbot"
              value={selectedId || ''}
              onChange={(e) => navigate(`/app/chatbots/${e.target.value}/configure`)}
              sx={{ minWidth: 200 }}
            >
              {chatbotsList.map((b) => (
                <MenuItem key={b.chatbotId} value={b.chatbotId}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {selectedId ? (
            <>
              <Button
                variant="outlined"
                startIcon={<CodeOutlinedIcon />}
                onClick={() => navigate(`/app/widget?chatbotId=${selectedId}`)}
              >
                Widget & Embed
              </Button>
              <Button
                variant="outlined"
                startIcon={<PlayArrowOutlinedIcon />}
                onClick={() => navigate(`/app/chatbots/${selectedId}/playground`)}
              >
                Open Playground
              </Button>
            </>
          ) : null}
        </Stack>
      </Box>

      {serverError ? <Alert severity="error">{serverError}</Alert> : null}
      {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
      {hasValidationErrors ? (
        <Alert severity="warning">
          Please review highlighted fields across the configuration tabs before saving.
        </Alert>
      ) : null}

      <Paper sx={{ overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={(_, next) => setActiveTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="General Settings" />
          <Tab label="AI Settings" />
          <Tab label="Response Settings" />
          <Tab label="Behavior Settings" />
        </Tabs>

        {loading ? (
          <Box sx={{ p: 4 }}>
            <Stack spacing={2}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={120} />
            </Stack>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ p: { xs: 3, sm: 4 } }}>
            {/* Tab 0: A. General Settings */}
            <Box sx={{ display: activeTab === 0 ? 'block' : 'none' }}>
              <Stack spacing={2.5}>
                <TextField
                  label="Chatbot Name"
                  fullWidth
                  required
                  {...register('name')}
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                />
                <TextField
                  label="Description"
                  fullWidth
                  multiline
                  rows={2}
                  {...register('description')}
                  error={Boolean(errors.description)}
                  helperText={errors.description?.message}
                />
                <TextField
                  label="Business Name & Information"
                  fullWidth
                  required
                  {...register('businessName')}
                  error={Boolean(errors.businessName)}
                  helperText={errors.businessName?.message}
                />
                <TextField
                  label="Website URL"
                  placeholder="https://yourcompany.com"
                  fullWidth
                  {...register('websiteUrl')}
                  error={Boolean(errors.websiteUrl)}
                  helperText={errors.websiteUrl?.message}
                />
              </Stack>
            </Box>

            {/* Tab 1: B. AI Settings */}
            <Box sx={{ display: activeTab === 1 ? 'block' : 'none' }}>
              <Stack spacing={2.5}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    select
                    label="AI Provider"
                    fullWidth
                    value={watch('aiProvider')}
                    onChange={(e) => {
                      const nextProviderCode = e.target.value;
                      setValue('aiProvider', nextProviderCode, { shouldValidate: true });
                      const nextProvider = providers.find((p) => p.code === nextProviderCode);
                      if (nextProvider?.models?.[0]?.id) {
                        setValue('aiModel', nextProvider.models[0].id, { shouldValidate: true });
                      }
                    }}
                    error={Boolean(errors.aiProvider)}
                    helperText={errors.aiProvider?.message}
                  >
                    {(providers.length ? providers : [{ code: 'GOOGLE_GEMINI', name: 'Google Gemini' }]).map((p) => (
                      <MenuItem key={p.code} value={p.code}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Gemini Model"
                    fullWidth
                    value={watch('aiModel')}
                    {...register('aiModel')}
                    error={Boolean(errors.aiModel)}
                    helperText={errors.aiModel?.message}
                  >
                    {availableModels.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <TextField
                  label="System Instructions"
                  fullWidth
                  multiline
                  rows={5}
                  placeholder="Provide clear instructions guiding how this assistant answers customer questions..."
                  {...register('systemInstructions')}
                  error={Boolean(errors.systemInstructions)}
                  helperText={errors.systemInstructions?.message}
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, pt: 1 }}>
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Temperature
                      </Typography>
                      <Typography
                        variant="body2"
                        className="tabular-nums"
                        sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {Number(watch('temperature')).toFixed(1)}
                      </Typography>
                    </Box>
                    <Controller
                      name="temperature"
                      control={control}
                      render={({ field }) => (
                        <Slider
                          value={Number(field.value)}
                          onChange={(_, val) => field.onChange(val)}
                          min={0}
                          max={2}
                          step={0.1}
                          valueLabelDisplay="auto"
                        />
                      )}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Lower values produce more deterministic answers (applied on Flash Lite; Gemini 4 models manage sampling automatically).
                    </Typography>
                  </Box>

                  <TextField
                    label="Maximum Output Tokens"
                    type="number"
                    fullWidth
                    slotProps={{ htmlInput: { min: 128, max: 8192, step: 64 } }}
                    {...register('maxOutputTokens')}
                    error={Boolean(errors.maxOutputTokens)}
                    helperText={errors.maxOutputTokens?.message || 'Allowed range: 128 to 8,192 tokens'}
                  />
                </Box>
              </Stack>
            </Box>

            {/* Tab 2: C. Response Settings */}
            <Box sx={{ display: activeTab === 2 ? 'block' : 'none' }}>
              <Stack spacing={2.5}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    select
                    label="Response Language"
                    fullWidth
                    value={watch('responseLanguage')}
                    {...register('responseLanguage')}
                    error={Boolean(errors.responseLanguage)}
                    helperText={errors.responseLanguage?.message}
                  >
                    {LANGUAGES.map((lang) => (
                      <MenuItem key={lang} value={lang}>
                        {lang}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Response Tone"
                    fullWidth
                    value={watch('responseTone')}
                    {...register('responseTone')}
                    error={Boolean(errors.responseTone)}
                    helperText={errors.responseTone?.message}
                  >
                    {TONES.map((tone) => (
                      <MenuItem key={tone} value={tone}>
                        {tone}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <TextField
                  label="Personality"
                  fullWidth
                  {...register('personality')}
                  error={Boolean(errors.personality)}
                  helperText={errors.personality?.message}
                />

                <TextField
                  label="Welcome Message"
                  fullWidth
                  multiline
                  rows={2}
                  {...register('welcomeMessage')}
                  error={Boolean(errors.welcomeMessage)}
                  helperText={errors.welcomeMessage?.message}
                />

                <TextField
                  label="Fallback Message"
                  fullWidth
                  multiline
                  rows={2}
                  {...register('fallbackMessage')}
                  error={Boolean(errors.fallbackMessage)}
                  helperText={errors.fallbackMessage?.message || 'Shown when the assistant cannot answer confidently'}
                />
              </Stack>
            </Box>

            {/* Tab 3: D. Behavior Settings */}
            <Box sx={{ display: activeTab === 3 ? 'block' : 'none' }}>
              <Stack spacing={2} divider={<Divider />}>
                <Controller
                  name="enableConversationHistory"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Enable Conversation History
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Pass recent conversation turns to Gemini for context-aware replies.
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />

                <Controller
                  name="enableHumanHandover"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Enable Human Handover
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Allow escalating complex customer inquiries to human support operators.
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />

                <Controller
                  name="enableFollowUpQuestions"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Enable Follow-up Questions
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Instruct the assistant to suggest one relevant next question when helpful.
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />

                <Controller
                  name="isEnabled"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Chatbot Enabled
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Disable to pause customer-facing access while retaining all configuration.
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />
              </Stack>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Button variant="outlined" color="inherit" onClick={() => navigate('/app/chatbots')}>
                Back to My Chatbots
              </Button>
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Configuration'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
