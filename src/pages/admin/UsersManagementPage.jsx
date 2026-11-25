import { useCallback, useEffect, useState } from 'react';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Pagination,
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
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { useAuth } from '../../hooks/useAuth';
import { userService } from '../../services/userService';
import { extractApiError, formatDateTime, getRoleLabel } from '../../utils/formatters';

export function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [mutating, setMutating] = useState(false);

  const pageSize = 10;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await userService.listUsers({
        search,
        role: roleFilter,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load platform users.'));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleStatus = async () => {
    if (!confirmTarget) return;
    setMutating(true);
    try {
      await userService.updateUserStatus(confirmTarget.userId, !confirmTarget.isActive);
      setConfirmTarget(null);
      await loadUsers();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update user status.'));
    } finally {
      setMutating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">User Management</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Inspect user accounts, assigned RBAC roles, and business workspace affiliations.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }} justifyContent="space-between">
          <TextField
            size="small"
            placeholder="Search full name or email..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            sx={{ minWidth: { sm: 320 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            select
            size="small"
            label="Role"
            value={roleFilter}
            onChange={(e) => {
              setPage(1);
              setRoleFilter(e.target.value);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value="SuperAdmin">Super Admin</MenuItem>
            <MenuItem value="BusinessOwner">Business Owner</MenuItem>
            <MenuItem value="BusinessAdmin">Business Admin</MenuItem>
            <MenuItem value="BusinessStaff">Business Staff</MenuItem>
          </TextField>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Business Workspace</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Sign-In</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton height={44} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No users match the current filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((u) => (
                  <TableRow key={u.userId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {u.fullName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {u.email}
                      </Typography>
                    </TableCell>
                    <TableCell>{getRoleLabel(u.role)}</TableCell>
                    <TableCell>{u.businessName || 'Platform Global'}</TableCell>
                    <TableCell>
                      <StatusText status={u.isActive ? 'Active' : 'Deactivated'} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(u.lastLoginOn)}</TableCell>
                    <TableCell align="right">
                      {u.userId !== currentUser?.userId ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color={u.isActive ? 'error' : 'success'}
                          onClick={() => setConfirmTarget(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Current Session
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {total > pageSize ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
            <Pagination
              count={Math.ceil(total / pageSize)}
              page={page}
              onChange={(_, p) => setPage(p)}
              size="small"
            />
          </Box>
        ) : null}
      </Paper>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={`${confirmTarget?.isActive ? 'Deactivate' : 'Activate'} ${confirmTarget?.fullName}?`}
        description={
          confirmTarget?.isActive
            ? 'This user will immediately lose API and dashboard access.'
            : 'This user will regain access to their assigned workspace.'
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate' : 'Activate'}
        confirmColor={confirmTarget?.isActive ? 'error' : 'primary'}
        loading={mutating}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleStatus}
      />
    </Box>
  );
}
