import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Pagination,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { userService } from '../../services/userService';
import { extractApiError, formatDateTime } from '../../utils/formatters';

export function AuditLogsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pageSize = 15;
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await userService.listAuditLogs({ page, pageSize });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load audit logs.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4">Audit Logs</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {isSuperAdmin
            ? 'Immutable platform-wide security and administrative activity trail.'
            : 'Security and workspace activity scoped strictly to your business tenant.'}
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Paper sx={{ p: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Actor</TableCell>
                {isSuperAdmin ? <TableCell>Business</TableCell> : null}
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 5 : 4}>
                    <Skeleton height={40} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 5 : 4} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No audit events recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((log) => (
                  <TableRow key={log.auditLogId} hover>
                    <TableCell className="tabular-nums" sx={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.createdOn)}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                      }}
                    >
                      {log.action}
                    </TableCell>
                    <TableCell>{log.actorName || log.actorEmail || 'System'}</TableCell>
                    {isSuperAdmin ? <TableCell>{log.businessName || 'Global'}</TableCell> : null}
                    <TableCell>{log.details || `${log.entityType} #${log.entityId || ''}`}</TableCell>
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
    </Box>
  );
}
