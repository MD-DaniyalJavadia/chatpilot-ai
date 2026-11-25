export function formatNumber(value) {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('en-US').format(Number.isFinite(num) ? num : 0);
}

export function formatCurrency(value) {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateShort(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getRoleLabel(role) {
  switch (role) {
    case 'SuperAdmin':
      return 'Super Admin';
    case 'BusinessOwner':
      return 'Business Owner';
    case 'BusinessAdmin':
      return 'Business Admin';
    case 'BusinessStaff':
      return 'Business Staff';
    default:
      return role || 'Member';
  }
}

export function extractApiError(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.message || error?.message || fallback;
}
