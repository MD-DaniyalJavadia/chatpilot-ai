import { useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Alert,
  Box,
  Button,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { chatbotService } from '../../services/chatbotService';
import { extractApiError } from '../../utils/formatters';
import { createChatbotSchema } from '../../validations/chatbotSchemas';

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese', 'Hindi'];
const TONES = ['Professional', 'Friendly', 'Concise', 'Empathetic', 'Consultative', 'Formal'];

export function CreateChatbotPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(createChatbotSchema),
    defaultValues: {
      name: '',
      description: '',
      businessName: user?.businessName || '',
      websiteUrl: '',
      aiProvider: 'GOOGLE_GEMINI',
      aiModel: 'gemini-4-hydrogen',
      systemInstructions: '',
      welcomeMessage: '',
      responseLanguage: 'English',
      responseTone: 'Professional',
      personality: 'Helpful, accurate, and polite',
    },
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await chatbotService.listProviders();
        if (active && res?.providers?.length) {
          setProviders(res.providers);
        }
      } catch {
        // Fallback options stay usable if provider catalog fetch fails
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedProviderCode = watch('aiProvider');
  const activeProvider = providers.find((p) => p.code === selectedProviderCode);
  const availableModels = activeProvider?.models || [
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Balanced)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fast)' },
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon (Advanced Reasoning)' },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep Reasoning)' },
  ];

  const onSubmit = async (values) => {
    setServerError('');
    try {
      const created = await chatbotService.createChatbot({
        ...values,
        websiteUrl: values.websiteUrl || null,
      });
      navigate(`/app/chatbots/${created.chatbotId}/playground`, { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to create chatbot.'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 840 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4">Create Chatbot</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Define your assistant identity, Gemini model, and instructions before testing in the Playground.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/app/chatbots')}>
          Back to Chatbots
        </Button>
      </Box>

      {serverError ? <Alert severity="error">{serverError}</Alert> : null}

      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Identity & Business Context
              </Typography>
              <Stack spacing={2.25}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    label="Chatbot Name"
                    placeholder="Support Concierge"
                    fullWidth
                    required
                    {...register('name')}
                    error={Boolean(errors.name)}
                    helperText={errors.name?.message}
                  />
                  <TextField
                    label="Business Name"
                    fullWidth
                    required
                    {...register('businessName')}
                    error={Boolean(errors.businessName)}
                    helperText={errors.businessName?.message}
                  />
                </Box>

                <TextField
                  label="Description"
                  placeholder="Helps website visitors with product questions, pricing, and onboarding."
                  fullWidth
                  multiline
                  rows={2}
                  {...register('description')}
                  error={Boolean(errors.description)}
                  helperText={errors.description?.message}
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

            <Divider />

            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                AI Provider & Model
              </Typography>
              <Stack spacing={2.25}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    select
                    label="AI Provider"
                    fullWidth
                    required
                    value={watch('aiProvider')}
                    onChange={(e) => {
                      const nextCode = e.target.value;
                      setValue('aiProvider', nextCode, { shouldValidate: true });
                      const nextProvider = providers.find((p) => p.code === nextCode);
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
                    label="AI Model"
                    fullWidth
                    required
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
                  placeholder="Answer clearly using verified company details. Do not invent pricing or refund terms."
                  fullWidth
                  multiline
                  rows={4}
                  {...register('systemInstructions')}
                  error={Boolean(errors.systemInstructions)}
                  helperText={errors.systemInstructions?.message}
                />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Response & Personality
              </Typography>
              <Stack spacing={2.25}>
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
                  label="Chatbot Personality"
                  placeholder="Helpful, attentive, and clear"
                  fullWidth
                  {...register('personality')}
                  error={Boolean(errors.personality)}
                  helperText={errors.personality?.message}
                />

                <TextField
                  label="Welcome Message"
                  placeholder="Hello! Ask me anything about our products or services."
                  fullWidth
                  {...register('welcomeMessage')}
                  error={Boolean(errors.welcomeMessage)}
                  helperText={errors.welcomeMessage?.message}
                />
              </Stack>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, pt: 1 }}>
              <Button variant="outlined" color="inherit" onClick={() => navigate('/app/chatbots')}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
                {isSubmitting ? 'Creating Chatbot...' : 'Create & Open Playground'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
