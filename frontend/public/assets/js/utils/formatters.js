// Date, currency, text formatting
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-PH');
};

export const formatRelativeTime = (date) => {
  // Fix: PostgreSQL timestamps without 'Z' are treated as local time by JavaScript
  // We need to ensure they're treated as UTC by adding 'Z' if missing
  let dateString = date;
  if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.includes('+')) {
    dateString = dateString + 'Z';
  }
  
  const now = new Date();
  const past = new Date(dateString);
  
  // Calculate difference in milliseconds and convert to seconds
  const diffMs = now.getTime() - past.getTime();
  const seconds = Math.floor(diffMs / 1000);
  
  // Handle future dates or invalid dates
  if (seconds < 0 || isNaN(seconds)) {
    return 'just now';
  }
  
  // Less than 1 minute
  if (seconds < 60) {
    return 'just now';
  }
  
  // Minutes (1-59)
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  
  // Hours (1-23)
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  // Days (1-6)
  const days = Math.floor(seconds / 86400);
  if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  
  // Weeks (1-3)
  const weeks = Math.floor(seconds / 604800);
  if (weeks < 4) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  
  // Months (1-11)
  const months = Math.floor(seconds / 2592000);
  if (months < 12) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  
  // Years
  const years = Math.floor(seconds / 31536000);
  return `${years} year${years > 1 ? 's' : ''} ago`;
};

export const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const capitalize = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const formatPhoneNumber = (phone) => {
  // Format: 0912-345-6789
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{4})(\d{3})(\d{4})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return phone;
};