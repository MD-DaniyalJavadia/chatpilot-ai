import { useCallback, useEffect, useState } from 'react';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
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
import { analyticsService } from '../../services/analyticsService';
import { chatbotService } from '../../services/chatbotService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function AnalyticsPage() {
  const theme = useTheme();
  const [chatbots, setChatbots] = useState([]);
  const [chatbotId, setChatbotId] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    chatbotService
      .listChatbots({ page: 1, pageSize: 50 })
      .then((res) => setChatbots(res?.items || []))
      .catch(() => {});
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsService.getOverview({ days, chatbotId });
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load analytics overview.'));
    } finally {
      setLoading(false);
    }
  }, [days, chatbotId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const kpis = data?.kpis || {};
  const dailySeries = data?.dailySeries || [];
  const chatbotBreakdown = data?.chatbotBreakdown || [];
  const popularQuestions = data?.popularQuestions || [];
  const unansweredPrompts = data?.unansweredPrompts || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Analytics</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Track daily conversations, AI token consumption, resolution rates, and knowledge gaps across your chatbots.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Chatbot"
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">All Chatbots</MenuItem>
            {chatbots.map((b) => (
              <MenuItem key={b.chatbotId} value={String(b.chatbotId)}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>

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
            onClick={loadAnalytics}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {/* KPI Strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard
          label="Conversations"
          value={formatNumber(kpis.totalConversations)}
          helperText={`${formatNumber(kpis.resolvedConversations)} resolved (${kpis.resolutionRate ?? 0}%)`}
          loading={loading}
        />
        <StatCard
          label="Total Messages"
          value={formatNumber(kpis.totalMessages)}
          helperText={`Visitor + Assistant turns (${days}d)`}
          loading={loading}
        />
        <StatCard
          label="Unanswered Prompts"
          value={formatNumber(kpis.unansweredMessages)}
          helperText="Fallback or missing KB matches"
          loading={loading}
        />
        <StatCard
          label="AI Tokens Used"
          value={formatNumber(kpis.totalTokensUsed)}
          helperText={`Gemini usage over ${days} days`}
          loading={loading}
        />
      </Box>

      {/* Primary Charts Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Daily Conversations & Messages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Customer widget sessions and total message turns over the selected {days}-day window.
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
                    dataKey="messages"
                    name="Messages"
                    stroke={theme.palette.primary.main}
                    fill={theme.palette.primary.main}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="conversations"
                    name="Conversations"
                    stroke={theme.palette.success.main}
                    fill={theme.palette.success.main}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Daily Gemini Token Consumption
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Combined widget and playground AI tokens recorded in UsageLogs.
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
                    dataKey="tokensUsed"
                    name="AI Tokens"
                    fill={theme.palette.primary.main}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Per-Chatbot Breakdown Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Chatbot Performance Breakdown
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Compare conversation volume, unanswered fallback rates, and token consumption per assistant.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Chatbot</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Conversations</TableCell>
                <TableCell align="right">Resolved</TableCell>
                <TableCell align="right">Messages</TableCell>
                <TableCell align="right">Unanswered</TableCell>
                <TableCell align="right">Tokens Used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton height={40} />
                  </TableCell>
                </TableRow>
              ) : chatbotBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No chatbots configured in this workspace yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                chatbotBreakdown.map((bot) => (
                  <TableRow key={bot.chatbotId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{bot.chatbotName}</TableCell>
                    <TableCell>
                      <StatusText status={bot.isEnabled ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.conversationsCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.resolvedCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.messagesCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.unansweredCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(bot.tokensUsed)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Popular Questions & Unanswered Knowledge Gaps */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Popular Visitor Questions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Most frequently asked customer inquiries over the last {days} days.
          </Typography>

          {loading ? (
            <Skeleton height={160} />
          ) : popularQuestions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
              No visitor questions recorded in this period yet.
            </Typography>
          ) : (
            <Stack spacing={1.5} divider={<Divider />}>
              {popularQuestions.map((q, idx) => (
                <Box key={`${idx}-${q.questionText.slice(0, 24)}`} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {q.questionText}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="tabular-nums">
                      Last asked {formatDateTime(q.lastAskedOn)}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    className="tabular-nums"
                    sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, flexShrink: 0 }}
                  >
                    {formatNumber(q.askCount)}×
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Unanswered Prompts (Knowledge Gaps)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Questions that triggered a fallback reply — add these to your FAQ or Knowledge Base.
          </Typography>

          {loading ? (
            <Skeleton height={160} />
          ) : unansweredPrompts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
              No unanswered prompts flagged during this timeframe.
            </Typography>
          ) : (
            <Stack spacing={1.5} divider={<Divider />}>
              {unansweredPrompts.map((item, idx) => (
                <Box key={`${item.conversationId}-${idx}`}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.userQuestion}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {item.chatbotName} · {formatDateTime(item.createdOn)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
