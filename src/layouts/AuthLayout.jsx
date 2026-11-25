import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { Box, Divider, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { useThemeMode } from '../hooks/useThemeMode';

export function AuthLayout({ children }) {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
        bgcolor: 'background.default',
      }}
    >
      {/* Left Brand & Architecture Summary Panel */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          bgcolor: mode === 'dark' ? '#0F172A' : '#0F172A',
          color: '#F8FAFC',
          borderRight: '1px solid',
          borderColor: mode === 'dark' ? '#1E293B' : '#1E293B',
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF' }}
          >
            ChatPilot AI
          </Typography>
          <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.75 }}>
            Multi-Tenant AI Chatbot SaaS Platform
          </Typography>
        </Box>

        <Box sx={{ maxWidth: 440 }}>
          <Typography
            variant="h3"
            sx={{
              fontSize: '2rem',
              lineHeight: 1.2,
              fontWeight: 700,
              color: '#FFFFFF',
              mb: 2,
            }}
          >
            Train grounded AI assistants for every business workspace.
          </Typography>
          <Typography variant="body1" sx={{ color: '#CBD5E1', lineHeight: 1.65 }}>
            Register your company tenant, manage team permissions with role-based access control,
            ingest business knowledge, and embed a secure cross-domain chat widget across your sites.
          </Typography>

          <Divider sx={{ my: 4, borderColor: 'rgba(148, 163, 184, 0.2)' }} />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#FFFFFF', mb: 0.5 }}>
                Tenant Isolation
              </Typography>
              <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', lineHeight: 1.5 }}>
                JWT claims and repository-level BusinessId scoping keep every customer workspace separated.
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#FFFFFF', mb: 0.5 }}>
                Rotating Sessions
              </Typography>
              <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', lineHeight: 1.5 }}>
                In-memory access tokens paired with hashed, single-use rotating refresh tokens.
              </Typography>
            </Box>
          </Box>
        </Box>

        <Typography variant="caption" sx={{ color: '#64748B' }}>
          ChatPilot AI Platform · Phase 1 Foundation
        </Typography>
      </Box>

      {/* Right Form Container */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          p: { xs: 2.5, sm: 4, md: 6 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography
            variant="h6"
            sx={{
              display: { xs: 'block', lg: 'none' },
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            ChatPilot AI
          </Typography>
          <Box sx={{ ml: 'auto' }}>
            <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton onClick={toggleMode} aria-label="Toggle color theme" size="small">
                {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Paper
            sx={{
              width: '100%',
              maxWidth: 480,
              p: { xs: 3, sm: 4 },
            }}
          >
            {children}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
