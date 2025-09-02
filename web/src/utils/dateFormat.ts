/**
 * Unified date formatting utilities
 */

/**
 * Format a date/time as relative time (e.g., "2m ago", "1h ago")
 */
export function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes >= 1) {
    return `${minutes}m ago`;
  } else {
    return '< 1m ago';
  }
}

/**
 * Format a date/time as local time string
 */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString();
}