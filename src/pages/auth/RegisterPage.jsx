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
  TextField,
  Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from '../../layouts/AuthLayout';
import { extractApiError } from '../../utils/formatters';
import { registerSchema } from '../../validations/authSchemas';

export function RegisterPage() {
  const { register: registerBusiness } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(registerSchema),
    defaultValues: {
      fullName: '',
      businessName: '',
      email: '',
      industry: '',
      websiteUrl: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await registerBusiness({
        fullName: values.fullName,
        businessName: values.businessName,
        email: values.email,
        industry: values.industry || undefined,
        websiteUrl: values.websiteUrl || undefined,
        password: values.password,
      });
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err, 'Unable to register business account.'));
    }
  };

  return (
    <AuthLayout>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.75 }}>
        Create your business workspace
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Start on the Free tier with isolated tenant storage and role-based team controls.
      </Typography>

      {serverError ? (
        <Alert severity="error" sx={{ mb: 2.5 }}>
          {serverError}
        </Alert>
      ) : null}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={2}>
          <TextField
            label="Your Full Name"
            fullWidth
            {...register('fullName')}
            error={Boolean(errors.fullName)}
            helperText={errors.fullName?.message}
          />

          <TextField
            label="Business Name"
            fullWidth
            {...register('businessName')}
            error={Boolean(errors.businessName)}
            helperText={errors.businessName?.message}
          />

          <TextField
            label="Work Email"
            type="email"
            fullWidth
            {...register('email')}
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Industry (Optional)"
              fullWidth
              {...register('industry')}
              error={Boolean(errors.industry)}
              helperText={errors.industry?.message}
            />
            <TextField
              label="Website URL (Optional)"
              placeholder="https://example.com"
              fullWidth
              {...register('websiteUrl')}
              error={Boolean(errors.websiteUrl)}
              helperText={errors.websiteUrl?.message}
            />
          </Box>

          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            {...register('password')}
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
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

          <TextField
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            {...register('confirmPassword')}
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
          />

          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Creating workspace...' : 'Create Business Account'}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="body2" color="text.secondary" align="center">
        Already have an account?{' '}
        <MuiLink component={RouterLink} to="/login" underline="hover" sx={{ fontWeight: 600 }}>
          Sign in
        </MuiLink>
      </Typography>
    </AuthLayout>
  );
}
