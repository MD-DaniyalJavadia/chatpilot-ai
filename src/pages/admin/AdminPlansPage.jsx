import { useCallback, useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { StatusText } from '../../components/common/StatusText';
import { planFormSchema } from '../../schemas/phase6Schemas';
import { billingService } from '../../services/billingService';
import { extractApiError, formatCurrency, formatNumber } from '../../utils/formatters';

const DEFAULT_VALUES = {
  code: '',
  name: '',
  description: '',
  monthlyPriceUsd: 0,
  yearlyPriceUsd: 0,
  maxChatbots: 1,
  maxMonthlyMessages: 1000,
  maxTeamMembers: 1,
  allowWebsiteIngestion: false,
};

export function AdminPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(planFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await billingService.listPlans({ includeInactive: true });
      setPlans(data.items || []);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load subscription plans.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openCreate = () => {
    setEditingPlan(null);
    reset(DEFAULT_VALUES);
    setDialogOpen(true);
  };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    reset({
      code: plan.code,
      name: plan.name,
      description: plan.description || '',
      monthlyPriceUsd: plan.monthlyPriceUsd,
      yearlyPriceUsd: plan.yearlyPriceUsd,
      maxChatbots: plan.maxChatbots,
      maxMonthlyMessages: plan.maxMonthlyMessages,
      maxTeamMembers: plan.maxTeamMembers,
      allowWebsiteIngestion: Boolean(plan.allowWebsiteIngestion),
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editingPlan) {
        await billingService.updatePlan(editingPlan.planId, {
          ...values,
          isActive: editingPlan.isActive,
        });
        setSuccess(`Updated subscription plan "${values.name}".`);
      } else {
        await billingService.createPlan(values);
        setSuccess(`Created subscription plan "${values.name}".`);
      }
      setDialogOpen(false);
      await loadPlans();
    } catch (err) {
      setError(extractApiError(err, 'Unable to save subscription plan.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (plan) => {
    setError('');
    setSuccess('');
    try {
      await billingService.setPlanStatus(plan.planId, !plan.isActive);
      setSuccess(`Plan "${plan.name}" ${plan.isActive ? 'archived' : 'activated'}.`);
      await loadPlans();
    } catch (err) {
      setError(extractApiError(err, 'Unable to update plan status.'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Subscription Plans</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Define commercial tiers, monthly and yearly USD pricing, chatbot limits, message quotas, and website crawling entitlements.
          </Typography>
        </Box>

        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreate}>
          New Plan Tier
        </Button>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Plan Name & Code</TableCell>
                <TableCell align="right">Monthly</TableCell>
                <TableCell align="right">Yearly</TableCell>
                <TableCell align="right">Chatbots</TableCell>
                <TableCell align="right">Msgs / Mo</TableCell>
                <TableCell align="right">Team Seats</TableCell>
                <TableCell>Web Crawl</TableCell>
                <TableCell align="right">Tenants</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No subscription plans found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.planId} hover>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {plan.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {plan.code}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCurrency(plan.monthlyPriceUsd)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCurrency(plan.yearlyPriceUsd)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(plan.maxChatbots)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(plan.maxMonthlyMessages)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(plan.maxTeamMembers)}
                    </TableCell>
                    <TableCell>{plan.allowWebsiteIngestion ? 'Included' : 'Disabled'}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatNumber(plan.activeTenantsCount ?? 0)}
                    </TableCell>
                    <TableCell>
                      <StatusText status={plan.isActive ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditOutlinedIcon />}
                          onClick={() => openEdit(plan)}
                        >
                          Edit
                        </Button>
                        {plan.code !== 'FREE' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color={plan.isActive ? 'warning' : 'success'}
                            onClick={() => handleToggleStatus(plan)}
                          >
                            {plan.isActive ? 'Archive' : 'Activate'}
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create Subscription Plan'}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Plan Code"
                size="small"
                fullWidth
                disabled={Boolean(editingPlan)}
                {...register('code')}
                error={Boolean(errors.code)}
                helperText={errors.code?.message || 'Uppercase identifier, e.g. GROWTH'}
              />
              <TextField
                label="Display Name"
                size="small"
                fullWidth
                {...register('name')}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
              />
            </Stack>

            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              minRows={2}
              {...register('description')}
              error={Boolean(errors.description)}
              helperText={errors.description?.message}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Monthly Price (USD)"
                type="number"
                size="small"
                fullWidth
                {...register('monthlyPriceUsd')}
                error={Boolean(errors.monthlyPriceUsd)}
                helperText={errors.monthlyPriceUsd?.message}
              />
              <TextField
                label="Yearly Price (USD)"
                type="number"
                size="small"
                fullWidth
                {...register('yearlyPriceUsd')}
                error={Boolean(errors.yearlyPriceUsd)}
                helperText={errors.yearlyPriceUsd?.message}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Max Chatbots"
                type="number"
                size="small"
                fullWidth
                {...register('maxChatbots')}
                error={Boolean(errors.maxChatbots)}
                helperText={errors.maxChatbots?.message}
              />
              <TextField
                label="Max Monthly Messages"
                type="number"
                size="small"
                fullWidth
                {...register('maxMonthlyMessages')}
                error={Boolean(errors.maxMonthlyMessages)}
                helperText={errors.maxMonthlyMessages?.message}
              />
              <TextField
                label="Max Team Members"
                type="number"
                size="small"
                fullWidth
                {...register('maxTeamMembers')}
                error={Boolean(errors.maxTeamMembers)}
                helperText={errors.maxTeamMembers?.message}
              />
            </Stack>

            <Controller
              name="allowWebsiteIngestion"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="Allow Website URL Crawling & Ingestion"
                />
              )}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
