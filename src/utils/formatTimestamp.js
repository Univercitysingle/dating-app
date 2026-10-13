import { formatDistanceToNow, format } from 'date-fns';

export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffInDays = (now - date) / (1000 * 60 * 60 * 24);

  if (diffInDays < 1) {
    return formatDistanceToNow(date, { addSuffix: true });
  } else if (diffInDays < 7) {
    return format(date, 'eeee'); // e.g., "Monday"
  } else {
    return format(date, 'P'); // e.g., "10/28/2024"
  }
};
