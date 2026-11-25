import { useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from '../../layouts/AuthLayout';
import { extractApiError } from '../../utils/formatters';
import { claimSuperAdminSchema, loginSchema } from '../../validations/authSchemas';

export function LoginPage() {
  const { login, claimSuperAdmin, bootstrapStatus } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const loginForm = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const claimForm = useForm({
    resolver: yupResolver(claimSuperAdminSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      passcode: '',
    },
  });

  const showBootstrapTab = bootstrapStatus.loaded && !bootstrapStatus.superAdminClaimed;

  const handleLoginSubmit = async (values) => {
    setServerError('');
    try {
      const user = await login(values);
      navigate(user.role === 'SuperAdmin' ? '/admin/dashboard' : '/app/dashboard', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to sign in.'));
    }
  };

  const handleClaimSubmit = async (values) => {
    setServerError('');
    try {
      await claimSuperAdmin({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        passcode: values.passcode || undefined,
      });
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to initialize Super Admin account.'));
    }
  };

  return (
    <AuthLayout>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.75 }}>
        {tab === 'claim' ? 'Initialize Super Admin' : 'Sign in to ChatPilot AI'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {tab === 'claim'
          ? 'First-run setup: create the primary platform administrator account. This locks once completed.'
          : 'Access your business chatbot workspace or platform administration console.'}
      </Typography>

      {showBootstrapTab ? (
        <Tabs
          value={tab}
          onChange={(_, next) => {
            setServerError('');
            setTab(next);
          }}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Sign In" value="login" />
          <Tab label="Setup Super Admin" value="claim" />
        </Tabs>
      ) : null}

      {bootstrapStatus?.maintenanceMode ? (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          Platform maintenance notice is active.
          {bootstrapStatus.supportContactEmail ? ` Need help? Contact ${bootstrapStatus.supportContactEmail}.` : ''}
        </Alert>
      ) : null}

      {serverError ? (
        <Alert severity="error" sx={{ mb: 2.5 }}>
          {serverError}
        </Alert>
      ) : null}

      {tab === 'login' || !showBootstrapTab ? (
        <Box component="form" onSubmit={loginForm.handleSubmit(handleLoginSubmit)} noValidate>
          <Stack spacing={2.25}>
            <TextField
              label="Email Address"
              type="email"
              fullWidth
              autoComplete="email"
              {...loginForm.register('email')}
              error={Boolean(loginForm.formState.errors.email)}
              helperText={loginForm.formState.errors.email?.message}
            />

            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              autoComplete="current-password"
              {...loginForm.register('password')}
              error={Boolean(loginForm.formState.errors.password)}
              helperText={loginForm.formState.errors.password?.message}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((p) => !p)}
                        edge="end"
                        aria-label="Toggle password visibility"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loginForm.formState.isSubmitting}
            >
              {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Box component="form" onSubmit={claimForm.handleSubmit(handleClaimSubmit)} noValidate>
          <Stack spacing={2}>
            <TextField
              label="Administrator Full Name"
              fullWidth
              {...claimForm.register('fullName')}
              error={Boolean(claimForm.formState.errors.fullName)}
              helperText={claimForm.formState.errors.fullName?.message}
            />
            <TextField
              label="Administrator Email"
              type="email"
              fullWidth
              {...claimForm.register('email')}
              error={Boolean(claimForm.formState.errors.email)}
              helperText={claimForm.formState.errors.email?.message}
            />
            {bootstrapStatus.requiresPasscode ? (
              <TextField
                label="Setup Passcode"
                type="password"
                fullWidth
                {...claimForm.register('passcode')}
              />
            ) : null}
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              {...claimForm.register('password')}
              error={Boolean(claimForm.formState.errors.password)}
              helperText={claimForm.formState.errors.password?.message}
            />
            <TextField
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              {...claimForm.register('confirmPassword')}
              error={Boolean(claimForm.formState.errors.confirmPassword)}
              helperText={claimForm.formState.errors.confirmPassword?.message}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={claimForm.formState.isSubmitting}
            >
              {claimForm.formState.isSubmitting ? 'Initializing...' : 'Create Super Admin Account'}
            </Button>
          </Stack>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="body2" color="text.secondary" align="center">
        New business?{' '}
        <MuiLink component={RouterLink} to="/register" underline="hover" sx={{ fontWeight: 600 }}>
          Create a workspace account
        </MuiLink>
      </Typography>
    </AuthLayout>
  );
}
