import { Box, Button, Divider, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function PhasePlaceholderPage({
  title,
  phaseNumber,
  description,
  plannedTables = [],
  plannedEndpoints = [],
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashboardPath = user?.role === 'SuperAdmin' ? '/admin/dashboard' : '/app/dashboard';

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, maxWidth: 880 }}>
      <Typography variant="caption" color="primary" sx={{ fontWeight: 600, letterSpacing: '0.02em' }}>
        Scheduled for Phase {phaseNumber}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.75, mb: 1.5 }}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '65ch', lineHeight: 1.65 }}>
        {description}
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Database Tables Provisioned
          </Typography>
          <Stack spacing={0.75}>
            {plannedTables.map((tbl) => (
              <Typography
                key={tbl}
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
              >
                {tbl}
              </Typography>
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            API Contracts Planned
          </Typography>
          <Stack spacing={0.75}>
            {plannedEndpoints.map((ep) => (
              <Typography
                key={ep}
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
              >
                {ep}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ mt: 3.5 }}>
        <Button variant="outlined" onClick={() => navigate(dashboardPath)}>
          Return to Dashboard
        </Button>
      </Box>
    </Paper>
  );
}
