export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString('en-US');
}

export function formatPercent(num: number): string {
  return `${num.toFixed(2)}%`;
}

export function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'text-emerald-600';
    case 'PAUSED':
      return 'text-amber-600';
    case 'DELETED':
    case 'ARCHIVED':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

export function getStatusDot(status: string): string {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-500';
    case 'PAUSED':
      return 'bg-amber-500';
    case 'DELETED':
    case 'ARCHIVED':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
