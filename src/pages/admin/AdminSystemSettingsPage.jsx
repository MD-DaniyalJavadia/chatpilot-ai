import { useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Paper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { systemSettingsSchema } from '../../schemas/phase6Schemas';
import { platformConfigService } from '../../services/platformConfigService';
import { extractApiError } from '../../utils/formatters';

export function AdminSystemSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(systemSettingsSchema),
    defaultValues: {
      allowPublicRegistration: true,
      defaultTrialDays: 14,
      defaultWidgetRateLimitPerMin: 60,
      conversationRetentionDays: 365,
      maintenanceMode: false,
      supportContactEmail: 'support@chatpilot.local',
    },
  });

  useEffect(() => {
    setLoading(true);
    platformConfigService
      .getSystemSettings()
      .then((data) => {
        reset(data);
      })
      .catch((err) => {
        setError(extractApiError(err, 'Unable to load system settings.'));
      })
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (values) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await platformConfigService.updateSystemSettings(values);
      reset(res.data);
      setSuccess('Platform system settings updated.');
    } catch (err) {
      setError(extractApiError(err, 'Unable to update system settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 820 }}>
      <Box>
        <Typography variant="h4">System Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Configure global SaaS registration access, widget request throttling defaults, transcript retention windows, and support contact routing.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Access & Workspace Onboarding
              </Typography>
              <Stack spacing={1.5}>
                <Controller
                  name="allowPublicRegistration"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label="Allow public self-service business workspace registration (/register)"
                    />
                  )}
                />
                <Controller
                  name="maintenanceMode"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                      label="Enable platform maintenance notice banner"
                    />
                  )}
                />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Quotas, Retention & Support Contact
              </Typography>
              <Stack spacing={2.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Default Trial Days"
                    type="number"
                    size="small"
                    fullWidth
                    {...register('defaultTrialDays')}
                    error={Boolean(errors.defaultTrialDays)}
                    helperText={errors.defaultTrialDays?.message || '0–90 days'}
                  />
                  <TextField
                    label="Widget Rate Limit (req/min)"
                    type="number"
                    size="small"
                    fullWidth
                    {...register('defaultWidgetRateLimitPerMin')}
                    error={Boolean(errors.defaultWidgetRateLimitPerMin)}
                    helperText={errors.defaultWidgetRateLimitPerMin?.message || '5–1,000 requests per IP per minute'}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Transcript Retention (Days)"
                    type="number"
                    size="small"
                    fullWidth
                    {...register('conversationRetentionDays')}
                    error={Boolean(errors.conversationRetentionDays)}
                    helperText={errors.conversationRetentionDays?.message || '7–3,650 days'}
                  />
                  <TextField
                    label="Platform Support Contact Email"
                    type="email"
                    size="small"
                    fullWidth
                    {...register('supportContactEmail')}
                    error={Boolean(errors.supportContactEmail)}
                    helperText={errors.supportContactEmail?.message}
                  />
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" startIcon={<SaveOutlinedIcon />} disabled={saving}>
                {saving ? 'Saving...' : 'Save System Settings'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
