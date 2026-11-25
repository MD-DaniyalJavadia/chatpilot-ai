import { useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Box, Button, MenuItem, Paper, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/useAuth';
import { businessService } from '../../services/businessService';
import { extractApiError } from '../../utils/formatters';
import { businessProfileSchema } from '../../validations/businessSchemas';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function BusinessProfilePage() {
  const { updateUserLocal } = useAuth();
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(businessProfileSchema),
    defaultValues: {
      name: '',
      industry: '',
      websiteUrl: '',
      supportEmail: '',
      timezone: 'UTC',
    },
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await businessService.getCurrentProfile();
        if (active && profile) {
          reset({
            name: profile.name || '',
            industry: profile.industry || '',
            websiteUrl: profile.websiteUrl || '',
            supportEmail: profile.supportEmail || '',
            timezone: profile.timezone || 'UTC',
          });
        }
      } catch (err) {
        if (active) setServerError(extractApiError(err, 'Failed to load business profile.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reset]);

  const onSubmit = async (values) => {
    setServerError('');
    setSuccessMessage('');
    try {
      const updated = await businessService.updateCurrentProfile(values);
      updateUserLocal({ businessName: updated.name });
      setSuccessMessage('Business profile saved.');
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to update business profile.'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>
      <Box>
        <Typography variant="h4">Business Profile</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage your organization metadata, support contact, and default workspace timezone.
        </Typography>
      </Box>

      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={2.5}>
              {serverError ? <Alert severity="error">{serverError}</Alert> : null}
              {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

              <TextField
                label="Business Name"
                fullWidth
                {...register('name')}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
              />

              <TextField
                label="Industry"
                fullWidth
                {...register('industry')}
                error={Boolean(errors.industry)}
                helperText={errors.industry?.message}
              />

              <TextField
                label="Website URL"
                placeholder="https://yourcompany.com"
                fullWidth
                {...register('websiteUrl')}
                error={Boolean(errors.websiteUrl)}
                helperText={errors.websiteUrl?.message}
              />

              <TextField
                label="Customer Support Email"
                type="email"
                fullWidth
                {...register('supportEmail')}
                error={Boolean(errors.supportEmail)}
                helperText={errors.supportEmail?.message}
              />

              <TextField
                select
                label="Timezone"
                fullWidth
                value={watch('timezone') || 'UTC'}
                {...register('timezone')}
                error={Boolean(errors.timezone)}
                helperText={errors.timezone?.message}
              >
                {TIMEZONES.map((tz) => (
                  <MenuItem key={tz} value={tz}>
                    {tz}
                  </MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="contained" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
