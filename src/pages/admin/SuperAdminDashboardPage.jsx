import { useEffect, useState } from 'react';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
import { StatusText } from '../../components/common/StatusText';
import { dashboardService } from '../../services/dashboardService';
import { extractApiError, formatCurrency, formatDateShort, formatNumber } from '../../utils/formatters';

export function SuperAdminDashboardPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await dashboardService.getSuperAdminDashboard();
      setData(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load platform metrics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const metrics = data?.metrics || {};
  const recentBusinesses = data?.recentBusinesses || [];
  const planDistribution = data?.planDistribution || [];
  const plans = data?.plans || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Platform Administration</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Live tenant counts, user registrations, and subscription metrics queried from the database.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={loadDashboard}
          disabled={loading}
        >
          Refresh Metrics
        </Button>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {/* 9 Requested Super Admin Dashboard Widgets */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard
          label="Total Registered Users"
          value={formatNumber(metrics.totalUsers)}
          helperText="Verified accounts across all roles"
          loading={loading}
        />
        <StatCard
          label="Total Businesses"
          value={formatNumber(metrics.totalBusinesses)}
          helperText="Registered multi-tenant workspaces"
          loading={loading}
        />
        <StatCard
          label="Total Active Chatbots"
          value={formatNumber(metrics.totalActiveChatbots)}
          helperText="Enabled bots (Phase 2 module)"
          loading={loading}
        />
        <StatCard
          label="Total Conversations"
          value={formatNumber(metrics.totalConversations)}
          helperText="Customer chat sessions (Phase 4)"
          loading={loading}
        />
        <StatCard
          label="Total Messages"
          value={formatNumber(metrics.totalMessages)}
          helperText="Processed message turns (Phase 4)"
          loading={loading}
        />
        <StatCard
          label="Total AI Tokens Used"
          value={formatNumber(metrics.totalAiTokensUsed)}
          helperText="Gemini consumption ledger"
          loading={loading}
        />
        <StatCard
          label="Monthly Revenue"
          value={formatCurrency(metrics.monthlyRevenueUsd)}
          helperText="Confirmed payment records"
          loading={loading}
        />
        <StatCard
          label="Active Subscriptions"
          value={formatNumber(metrics.activeSubscriptions)}
          helperText="Current active business plans"
          loading={loading}
        />
        <StatCard
          label="Expired Subscriptions"
          value={formatNumber(metrics.expiredSubscriptions)}
          helperText="Plans requiring renewal"
          loading={loading}
        />
      </Box>

      {/* Chart + Plan Catalog Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: 3 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Active Subscriptions by Plan Tier
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Real-time distribution of active tenant subscriptions across configured tiers.
          </Typography>

          {loading ? (
            <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1 }} />
          ) : (
            <Box sx={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={planDistribution} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                  <XAxis dataKey="planName" stroke={theme.palette.text.secondary} fontSize={12} />
                  <YAxis allowDecimals={false} stroke={theme.palette.text.secondary} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="tenantCount" name="Active Tenants" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Configured Subscription Plans
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Seeded SaaS limits enforced across tenant workspaces.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Plan</TableCell>
                  <TableCell align="right">Monthly</TableCell>
                  <TableCell align="right">Bots</TableCell>
                  <TableCell align="right">Msgs/mo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Skeleton height={32} />
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((p) => (
                    <TableRow key={p.planId}>
                      <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatCurrency(p.monthlyPriceUsd)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatNumber(p.maxChatbots)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {formatNumber(p.maxMonthlyMessages)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Recent Businesses Table */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6">Recent Registered Businesses</Typography>
            <Typography variant="body2" color="text.secondary">
              Latest customer organizations provisioned on the platform.
            </Typography>
          </Box>
          <Button variant="text" onClick={() => navigate('/admin/businesses')}>
            Manage All Businesses
          </Button>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Business Name</TableCell>
                <TableCell>Industry</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell align="right">Members</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={36} />
                  </TableCell>
                </TableRow>
              ) : recentBusinesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No businesses have registered yet. Register a workspace via the sign-up flow to see live tenant records.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                recentBusinesses.map((biz) => (
                  <TableRow key={biz.businessId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{biz.name}</TableCell>
                    <TableCell>{biz.industry || '—'}</TableCell>
                    <TableCell>{biz.planName || 'Free'}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(biz.memberCount)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={biz.status} />
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatDateShort(biz.createdOn)}
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
