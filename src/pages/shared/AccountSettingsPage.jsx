import { useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/useAuth';
import { userService } from '../../services/userService';
import { extractApiError, getRoleLabel } from '../../utils/formatters';
import { accountProfileSchema, changePasswordSchema } from '../../validations/businessSchemas';

export function AccountSettingsPage() {
  const { user, updateUserLocal } = useAuth();
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });

  const profileForm = useForm({
    resolver: yupResolver(accountProfileSchema),
    defaultValues: { fullName: user?.fullName || '' },
  });

  const passwordForm = useForm({
    resolver: yupResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });

  const handleSaveProfile = async (values) => {
    setProfileMsg({ type: '', text: '' });
    try {
      const updated = await userService.updateOwnProfile(values);
      updateUserLocal({ fullName: updated.fullName });
      setProfileMsg({ type: 'success', text: 'Display name updated.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleChangePassword = async (values) => {
    setPasswordMsg({ type: '', text: '' });
    try {
      await userService.updateOwnPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset();
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setPasswordMsg({ type: 'error', text: extractApiError(err) });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>
      <Box>
        <Typography variant="h4">Account Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {user?.email} · {getRoleLabel(user?.role)}
        </Typography>
      </Box>

      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Personal Profile
        </Typography>
        <Box component="form" onSubmit={profileForm.handleSubmit(handleSaveProfile)} noValidate>
          <Stack spacing={2.25}>
            {profileMsg.text ? <Alert severity={profileMsg.type}>{profileMsg.text}</Alert> : null}
            <TextField
              label="Full Name"
              fullWidth
              {...profileForm.register('fullName')}
              error={Boolean(profileForm.formState.errors.fullName)}
              helperText={profileForm.formState.errors.fullName?.message}
            />
            <TextField label="Email Address" value={user?.email || ''} fullWidth disabled />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? 'Saving...' : 'Save Profile'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Change Password
        </Typography>
        <Box component="form" onSubmit={passwordForm.handleSubmit(handleChangePassword)} noValidate>
          <Stack spacing={2.25}>
            {passwordMsg.text ? <Alert severity={passwordMsg.type}>{passwordMsg.text}</Alert> : null}
            <TextField
              label="Current Password"
              type="password"
              fullWidth
              {...passwordForm.register('currentPassword')}
              error={Boolean(passwordForm.formState.errors.currentPassword)}
              helperText={passwordForm.formState.errors.currentPassword?.message}
            />
            <TextField
              label="New Password"
              type="password"
              fullWidth
              {...passwordForm.register('newPassword')}
              error={Boolean(passwordForm.formState.errors.newPassword)}
              helperText={passwordForm.formState.errors.newPassword?.message}
            />
            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
              {...passwordForm.register('confirmNewPassword')}
              error={Boolean(passwordForm.formState.errors.confirmNewPassword)}
              helperText={passwordForm.formState.errors.confirmNewPassword?.message}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" disabled={passwordForm.formState.isSubmitting}>
                {passwordForm.formState.isSubmitting ? 'Updating...' : 'Update Password'}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
