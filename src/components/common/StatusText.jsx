import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import PauseCircleOutlineOutlinedIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import { Box, Typography } from '@mui/material';

export function StatusText({ status }) {
  const normalized = String(status || '').toLowerCase();

  let colorKey = 'text.secondary';
  let Icon = PauseCircleOutlineOutlinedIcon;
  let label = status || 'Unknown';

  if (
    normalized === 'active' ||
    normalized === 'enabled' ||
    normalized === 'healthy' ||
    normalized === 'indexed' ||
    normalized === 'resolved' ||
    normalized === 'succeeded' ||
    normalized === 'paid'
  ) {
    colorKey = 'success.main';
    Icon = CheckCircleOutlineOutlinedIcon;
  } else if (
    normalized === 'suspended' ||
    normalized === 'pastdue' ||
    normalized === 'pending' ||
    normalized === 'processing' ||
    normalized === 'open' ||
    normalized === 'inprogress' ||
    normalized === 'cancelled' ||
    normalized === 'refunded' ||
    normalized === 'high'
  ) {
    colorKey = 'warning.main';
    Icon = PauseCircleOutlineOutlinedIcon;
  } else if (
    normalized === 'deactivated' ||
    normalized === 'inactive' ||
    normalized === 'expired' ||
    normalized === 'failed' ||
    normalized === 'urgent'
  ) {
    colorKey = 'error.main';
    Icon = HighlightOffIcon;
  }

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: colorKey }}>
      <Icon sx={{ fontSize: 16 }} />
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit', whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}
