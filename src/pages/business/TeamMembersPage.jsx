import { useCallback, useEffect, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { StatusText } from '../../components/common/StatusText';
import { useAuth } from '../../hooks/useAuth';
import { businessService } from '../../services/businessService';
import { extractApiError, formatDateShort, getRoleLabel } from '../../utils/formatters';
import { addTeamMemberSchema } from '../../validations/businessSchemas';

export function TeamMembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(addTeamMemberSchema),
    defaultValues: {
      fullName: '',
      email: '',
      role: 'BusinessStaff',
      password: '',
    },
  });

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await businessService.listTeamMembers();
      setMembers(list);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load team members.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAddMember = async (values) => {
    setFormError('');
    try {
      await businessService.addTeamMember(values);
      setDialogOpen(false);
      reset({ fullName: '', email: '', role: 'BusinessStaff', password: '' });
      await loadMembers();
    } catch (err) {
      setFormError(extractApiError(err, 'Unable to add team member.'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="h4">Team Members</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Provision Business Admins and Business Staff scoped strictly to your business workspace.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddOutlinedIcon />}
          onClick={() => {
            setFormError('');
            setDialogOpen(true);
          }}
        >
          Add Team Member
        </Button>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Member</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Joined</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton height={40} />
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No team members found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow key={m.userId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {m.fullName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {m.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {getRoleLabel(m.role)}
                      {m.isPrimaryOwner ? ' · Primary' : ''}
                    </TableCell>
                    <TableCell>
                      <StatusText status={m.isActive ? 'Active' : 'Deactivated'} />
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatDateShort(m.joinedOn)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Add Team Member</DialogTitle>
        <Box component="form" onSubmit={handleSubmit(handleAddMember)} noValidate>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {formError ? <Alert severity="error">{formError}</Alert> : null}
              <TextField
                label="Full Name"
                fullWidth
                {...register('fullName')}
                error={Boolean(errors.fullName)}
                helperText={errors.fullName?.message}
              />
              <TextField
                label="Work Email"
                type="email"
                fullWidth
                {...register('email')}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <TextField
                select
                label="Workspace Role"
                fullWidth
                value={watch('role')}
                {...register('role')}
                error={Boolean(errors.role)}
                helperText={errors.role?.message}
              >
                <MenuItem value="BusinessStaff">Business Staff</MenuItem>
                {user?.role === 'BusinessOwner' ? (
                  <MenuItem value="BusinessAdmin">Business Admin</MenuItem>
                ) : null}
              </TextField>
              <TextField
                label="Temporary Password"
                type="password"
                fullWidth
                {...register('password')}
                error={Boolean(errors.password)}
                helperText={errors.password?.message}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setDialogOpen(false)} color="inherit" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Create Member'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
