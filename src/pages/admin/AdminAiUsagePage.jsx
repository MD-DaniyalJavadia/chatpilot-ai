import { useCallback, useEffect, useState } from 'react';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { adminMonitoringService } from '../../services/adminMonitoringService';
import { extractApiError, formatNumber } from '../../utils/formatters';

export function AdminAiUsagePage() {
  const theme = useTheme();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminMonitoringService.getAiUsage({ days });
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load platform AI usage telemetry.'));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const summary = data?.summary || {};
  const dailySeries = data?.dailySeries || [];
  const modelBreakdown = data?.modelBreakdown || [];
  const tenantLeaderboard = data?.tenantLeaderboard || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">AI Usage Monitoring</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Monitor platform-wide Gemini token consumption, API request velocity, and tenant quota burn rates.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            select
            size="small"
            label="Window"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value={7}>Last 7 Days</MenuItem>
            <MenuItem value={14}>Last 14 Days</MenuItem>
            <MenuItem value={30}>Last 30 Days</MenuItem>
            <MenuItem value={90}>Last 90 Days</MenuItem>
          </TextField>

          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={loadUsage}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>
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
          label="Total Tokens Used"
          value={formatNumber(summary.totalTokensUsed)}
          helperText={`Platform Gemini tokens (${days}d)`}
          loading={loading}
        />
        <StatCard
          label="Widget Messages"
          value={formatNumber(summary.totalWidgetMessages)}
          helperText={`Billed message turns (${days}d)`}
          loading={loading}
        />
        <StatCard
          label="API Calls"
          value={formatNumber(summary.totalApiCalls)}
          helperText={`Logged completion & RAG calls`}
          loading={loading}
        />
        <StatCard
          label="Active Consuming Tenants"
          value={formatNumber(summary.activeConsumingTenants)}
          helperText={`Workspaces with activity in ${days}d`}
          loading={loading}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Daily Token Consumption
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Aggregate token throughput across all tenant workspaces over the last {days} days.
          </Typography>

          {loading ? (
            <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
          ) : (
            <Box sx={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                  <Area
                    type="monotone"
                    dataKey="tokensUsed"
                    name="Tokens Used"
                    stroke={theme.palette.primary.main}
                    fill={theme.palette.primary.main}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Daily API Calls & Widget Messages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Daily volume of Gemini completions and counted widget turns.
          </Typography>

          {loading ? (
            <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
          ) : (
            <Box sx={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                  <Bar
                    dataKey="apiCallsCount"
                    name="API Calls"
                    fill={theme.palette.primary.main}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="messagesCount"
                    name="Widget Messages"
                    fill={theme.palette.success.main}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Model Breakdown */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Model Usage Breakdown
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Token volume partitioned by Gemini model identifier across the selected timeframe.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model Identifier</TableCell>
                <TableCell align="right">API Calls</TableCell>
                <TableCell align="right">Tokens Used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Skeleton height={38} />
                  </TableCell>
                </TableRow>
              ) : modelBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No AI calls logged in the selected {days}-day window.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                modelBreakdown.map((m) => (
                  <TableRow key={m.modelName} hover>
                    <TableCell sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}>
                      {m.modelName}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(m.apiCallsCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums" sx={{ fontWeight: 600 }}>
                      {formatNumber(m.tokensUsed)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Tenant Consumption Leaderboard */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Tenant Consumption Leaderboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Top consuming business accounts compared against their active subscription message quotas.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Business Tenant</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell sx={{ minWidth: 190 }}>Message Quota ({days}d)</TableCell>
                <TableCell align="right">API Calls</TableCell>
                <TableCell align="right">Tokens Used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : tenantLeaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No tenant workspaces registered yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tenantLeaderboard.map((t) => {
                  const maxMsgs = Math.max(1, Number(t.maxMonthlyMessages || 250));
                  const pct = Math.min(100, Math.round((Number(t.widgetMessagesCount || 0) / maxMsgs) * 100));
                  return (
                    <TableRow key={t.businessId} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{t.businessName}</TableCell>
                      <TableCell>
                        <StatusText status={t.businessStatus} />
                      </TableCell>
                      <TableCell>{t.planName}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" className="tabular-nums">
                            {formatNumber(t.widgetMessagesCount)} / {formatNumber(maxMsgs)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" className="tabular-nums">
                            {pct}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          color={pct >= 90 ? 'error' : pct >= 75 ? 'warning' : 'primary'}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatNumber(t.apiCallsCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums" sx={{ fontWeight: 600 }}>
                        {formatNumber(t.tokensUsed)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
