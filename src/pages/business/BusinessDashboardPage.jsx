import { useEffect, useState } from 'react';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../../components/common/StatCard';
import { StatusText } from '../../components/common/StatusText';
import { useAuth } from '../../hooks/useAuth';
import { dashboardService } from '../../services/dashboardService';
import { extractApiError, formatDateTime, formatNumber } from '../../utils/formatters';

export function BusinessDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await dashboardService.getBusinessDashboard();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load business workspace overview.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const summary = data?.summary || {};
  const recentAuditLogs = data?.recentAuditLogs || [];
  const canManageWorkspace = user?.role === 'BusinessOwner' || user?.role === 'BusinessAdmin';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">{summary.businessName || user?.businessName || 'Business Workspace'}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              Plan: {summary.planName || 'Free'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ·
            </Typography>
            <StatusText status={summary.businessStatus || 'Active'} />
          </Box>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={loadDashboard}
            disabled={loading}
          >
            Refresh
          </Button>
          {canManageWorkspace ? (
            <Button variant="contained" onClick={() => navigate('/app/profile')}>
              Edit Business Profile
            </Button>
          ) : null}
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
          label="Chatbots Provisioned"
          value={`${formatNumber(summary.chatbotCount)} / ${formatNumber(summary.maxChatbots || 1)}`}
          helperText="Subscription chatbot allowance"
          loading={loading}
        />
        <StatCard
          label="Team Members"
          value={`${formatNumber(summary.teamMemberCount)} / ${formatNumber(summary.maxTeamMembers || 1)}`}
          helperText="Active workspace operators"
          loading={loading}
        />
        <StatCard
          label="Conversations"
          value={formatNumber(summary.conversationCount)}
          helperText="Tracked customer sessions"
          loading={loading}
        />
        <StatCard
          label="Messages & AI Tokens"
          value={`${formatNumber(summary.messageCount)} · ${formatNumber(summary.tokensUsed)}`}
          helperText={`Monthly cap: ${formatNumber(summary.maxMonthlyMessages || 250)} messages`}
          loading={loading}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Workspace Details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Isolated configuration scoped exclusively to Business #{summary.businessId || user?.businessId}.
          </Typography>

          {loading ? (
            <Stack spacing={1.5}>
              <Skeleton height={28} />
              <Skeleton height={28} />
              <Skeleton height={28} />
            </Stack>
          ) : (
            <Stack spacing={1.5} divider={<Divider />}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Industry
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {summary.industry || 'Not specified'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Support Email
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {summary.supportEmail || '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Website URL
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {summary.websiteUrl || 'Not configured'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Timezone
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {summary.timezone || 'UTC'}
                </Typography>
              </Box>
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6">Recent Workspace Activity</Typography>
              <Typography variant="body2" color="text.secondary">
                Tenant-scoped audit events recorded for your business.
              </Typography>
            </Box>
            {canManageWorkspace ? (
              <Button variant="text" onClick={() => navigate('/app/audit-logs')}>
                View All
              </Button>
            ) : null}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell align="right">Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Skeleton height={36} />
                    </TableCell>
                  </TableRow>
                ) : recentAuditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ py: 4, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        No workspace events logged yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  recentAuditLogs.map((log) => (
                    <TableRow key={log.auditLogId}>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem' }}
                        >
                          {log.action}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {log.details}
                        </Typography>
                      </TableCell>
                      <TableCell>{log.actorName || 'System'}</TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatDateTime(log.createdOn)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
}
