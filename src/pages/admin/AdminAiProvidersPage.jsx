import { useCallback, useEffect, useState } from 'react';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { StatusText } from '../../components/common/StatusText';
import { platformConfigService } from '../../services/platformConfigService';
import { extractApiError } from '../../utils/formatters';

export function AdminAiProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await platformConfigService.listAiProviders();
      setProviders(data.providers || []);
      setGeminiConfigured(Boolean(data.geminiConfigured));
    } catch (err) {
      setError(extractApiError(err, 'Unable to load AI providers.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const updateLocalProvider = (providerId, updater) => {
    setProviders((prev) =>
      prev.map((p) => (p.providerId === providerId ? updater(p) : p))
    );
  };

  const handleSaveProvider = async (provider) => {
    setSavingId(provider.providerId);
    setError('');
    setSuccess('');
    try {
      await platformConfigService.updateAiProvider(provider.providerId, {
        name: provider.name,
        isActive: provider.isActive,
        models: provider.models,
      });
      setSuccess(`Saved configuration for ${provider.name}.`);
      await loadProviders();
    } catch (err) {
      setError(extractApiError(err, 'Unable to save AI provider configuration.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 960 }}>
      <Box>
        <Typography variant="h4">AI Provider Configuration</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage active AI providers and supported Gemini model catalogs exposed to business workspaces. API credentials remain strictly server-side.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Paper sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            Server GEMINI_API_KEY Environment Status
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configured via host environment secrets (never exposed to browser clients).
          </Typography>
        </Box>
        <StatusText status={geminiConfigured ? 'Healthy' : 'Pending'} />
      </Paper>

      {loading ? (
        <Paper sx={{ p: 3 }}>
          <Skeleton height={180} />
        </Paper>
      ) : (
        providers.map((provider) => (
          <Paper key={provider.providerId} sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
              <Box>
                <Typography variant="h6">{provider.name}</Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Provider Code: {provider.code}
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(provider.isActive)}
                    onChange={(e) =>
                      updateLocalProvider(provider.providerId, (p) => ({
                        ...p,
                        isActive: e.target.checked,
                      }))
                    }
                  />
                }
                label={provider.isActive ? 'Enabled for Workspaces' : 'Disabled'}
              />
            </Box>

            <TextField
              label="Provider Display Name"
              size="small"
              value={provider.name}
              onChange={(e) =>
                updateLocalProvider(provider.providerId, (p) => ({ ...p, name: e.target.value }))
              }
              sx={{ maxWidth: 360 }}
            />

            <Divider />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Supported Model Catalog ({provider.models.length})
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                onClick={() =>
                  updateLocalProvider(provider.providerId, (p) => ({
                    ...p,
                    models: [...p.models, { id: '', label: '', tier: 'standard' }],
                  }))
                }
              >
                Add Model
              </Button>
            </Box>

            <Stack spacing={1.5}>
              {provider.models.map((model, idx) => (
                <Stack
                  key={`${provider.providerId}-${idx}`}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ sm: 'center' }}
                >
                  <TextField
                    size="small"
                    label="Model ID"
                    value={model.id}
                    onChange={(e) =>
                      updateLocalProvider(provider.providerId, (p) => {
                        const next = [...p.models];
                        next[idx] = { ...next[idx], id: e.target.value };
                        return { ...p, models: next };
                      })
                    }
                    sx={{ flex: 1, '& input': { fontFamily: "'JetBrains Mono', monospace" } }}
                  />
                  <TextField
                    size="small"
                    label="Display Label"
                    value={model.label}
                    onChange={(e) =>
                      updateLocalProvider(provider.providerId, (p) => {
                        const next = [...p.models];
                        next[idx] = { ...next[idx], label: e.target.value };
                        return { ...p, models: next };
                      })
                    }
                    sx={{ flex: 1.4 }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Tier"
                    value={model.tier || 'standard'}
                    onChange={(e) =>
                      updateLocalProvider(provider.providerId, (p) => {
                        const next = [...p.models];
                        next[idx] = { ...next[idx], tier: e.target.value };
                        return { ...p, models: next };
                      })
                    }
                    sx={{ minWidth: 130 }}
                  >
                    <MenuItem value="standard">standard</MenuItem>
                    <MenuItem value="paid">paid</MenuItem>
                  </TextField>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={provider.models.length <= 1}
                    onClick={() =>
                      updateLocalProvider(provider.providerId, (p) => ({
                        ...p,
                        models: p.models.filter((_, i) => i !== idx),
                      }))
                    }
                    aria-label="Remove model"
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<SaveOutlinedIcon />}
                disabled={savingId === provider.providerId}
                onClick={() => handleSaveProvider(provider)}
              >
                {savingId === provider.providerId ? 'Saving...' : 'Save Provider Config'}
              </Button>
            </Box>
          </Paper>
        ))
      )}
    </Box>
  );
}
