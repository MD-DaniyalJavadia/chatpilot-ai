import { useEffect, useState } from 'react';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatCard } from '../../components/common/StatCard';
import { analyticsService } from '../../services/analyticsService';
import { extractApiError, formatNumber } from '../../utils/formatters';

function QuotaRow({ label, used, limit, helper }) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const pct = Math.min(100, Math.round(((Number(used) || 0) / safeLimit) * 100));
  const color = pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75, gap: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" className="tabular-nums" sx={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {formatNumber(used)} / {formatNumber(limit)} ({pct}%)
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 8, borderRadius: 4 }} />
      {helper ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {helper}
        </Typography>
      ) : null}
    </Box>
  );
}

export function UsageStatsPage() {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsage = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsService.getUsageSummary();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load workspace usage statistics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, []);

  const quotas = data?.quotas || {};
  const modelBreakdown = data?.modelBreakdown || [];
  const dailyUsage = data?.dailyUsage || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Usage Statistics</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Monitor monthly message quotas, Gemini token burn, and indexed knowledge footprint for billing period{' '}
            <Box component="span" sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              {data?.billingPeriod || 'Current Month'}
            </Box>
            .
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={loadUsage}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard
          label="Active Plan Tier"
          value={quotas.planName || 'Free'}
          helperText={quotas.allowWebsiteIngestion ? 'Website crawler enabled' : 'Standard ingestion'}
          loading={loading}
        />
        <StatCard
          label="Monthly Visitor Messages"
          value={`${formatNumber(quotas.monthlyUserMessagesUsed)} / ${formatNumber(quotas.maxMonthlyMessages || 250)}`}
          helperText="Current UTC calendar month"
          loading={loading}
        />
        <StatCard
          label="Monthly AI Tokens"
          value={formatNumber(quotas.monthlyTokensUsed)}
          helperText="Widget + Playground completions"
          loading={loading}
        />
        <StatCard
          label="Knowledge Base Vectors"
          value={formatNumber(quotas.knowledgeChunksCount)}
          helperText={`${formatNumber(quotas.knowledgeSourcesCount)} sources · ${formatNumber(quotas.knowledgeTokensIndexed)} tokens`}
          loading={loading}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Subscription Quota Meters
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Real-time enforcement caps applied to your workspace.
          </Typography>

          {loading ? (
            <Stack spacing={2.5}>
              <Skeleton height={44} />
              <Skeleton height={44} />
              <Skeleton height={44} />
            </Stack>
          ) : (
            <Stack spacing={3}>
              <QuotaRow
                label="Monthly Widget Messages"
                used={quotas.monthlyUserMessagesUsed}
                limit={quotas.maxMonthlyMessages || 250}
                helper="Resets on the 1st of each UTC calendar month"
              />
              <QuotaRow
                label="Chatbots Provisioned"
                used={quotas.chatbotsUsed}
                limit={quotas.maxChatbots || 1}
                helper="Active & paused chatbots in your workspace"
              />
              <QuotaRow
                label="Workspace Team Members"
                used={quotas.teamMembersUsed}
                limit={quotas.maxTeamMembers || 1}
                helper="Owners, Admins, and Staff seats"
              />
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            14-Day Token Consumption
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Daily Gemini token usage across all chatbots in your tenant.
          </Typography>

          {loading ? (
            <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1 }} />
          ) : (
            <Box sx={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={dailyUsage} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                  <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={12} />
                  <YAxis allowDecimals={false} stroke={theme.palette.text.secondary} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="tokensUsed" name="Tokens Used" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Monthly Usage by Gemini Model
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Breakdown of requests, widget messages, and total tokens per AI model for {data?.billingPeriod || 'this month'}.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="right">API Requests</TableCell>
                <TableCell align="right">Widget Messages</TableCell>
                <TableCell align="right">Tokens Used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton height={36} />
                  </TableCell>
                </TableRow>
              ) : modelBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No AI completions logged yet this month.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                modelBreakdown.map((m) => (
                  <TableRow key={m.modelName} hover>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 600 }}>
                      {m.modelName}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(m.requestCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(m.widgetMessages)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(m.tokensUsed)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
