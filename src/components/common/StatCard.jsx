import { Paper, Skeleton, Typography } from '@mui/material';

export function StatCard({ label, value, helperText, loading = false }) {
  return (
    <Paper
      sx={{
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 1,
        height: '100%',
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>

      {loading ? (
        <Skeleton variant="text" width="55%" height={36} />
      ) : (
        <Typography
          variant="h4"
          className="tabular-nums"
          sx={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            fontSize: '1.625rem',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </Typography>
      )}

      {helperText ? (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      ) : null}
    </Paper>
  );
}
