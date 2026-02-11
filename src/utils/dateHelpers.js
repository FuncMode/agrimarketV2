// src\utils\dateHelpers.js

exports.formatDate = (date, format = 'default') => {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }

  const formats = {
    'default': d.toLocaleDateString('en-PH'),
    'long': d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    'short': d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
    'time': d.toLocaleTimeString('en-PH'),
    'datetime': d.toLocaleString('en-PH'),
    'iso': d.toISOString()
  };

  return formats[format] || formats.default;
};

exports.daysBetween = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

exports.isPast = (date) => {
  return new Date(date) < new Date();
};

exports.isFuture = (date) => {
  return new Date(date) > new Date();
};

exports.isToday = (date) => {
  const d = new Date(date);
  const today = new Date();
  
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

exports.addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

exports.addHours = (date, hours) => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

exports.startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

exports.endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

exports.timeAgo = (date) => {
  const now = new Date();
  const past = new Date(date);
  const seconds = Math.floor((now - past) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    
    if (interval >= 1) {
      return interval === 1 
        ? `1 ${unit} ago`
        : `${interval} ${unit}s ago`;
    }
  }

  return 'just now';
};

exports.timeUntil = (date) => {
  const now = new Date();
  const future = new Date(date);
  const seconds = Math.floor((future - now) / 1000);

  if (seconds < 0) {
    return 'expired';
  }

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    
    if (interval >= 1) {
      return interval === 1 
        ? `in 1 ${unit}`
        : `in ${interval} ${unit}s`;
    }
  }

  return 'now';
};

exports.formatTimeRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (exports.isToday(start) && exports.isToday(end)) {
    return `Today ${start.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `${exports.formatDate(start, 'short')} - ${exports.formatDate(end, 'short')}`;
};

exports.getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNumber;
};

exports.getMonthName = (date, short = false) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-PH', { month: short ? 'short' : 'long' });
};

exports.getDayName = (date, short = false) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-PH', { weekday: short ? 'short' : 'long' });
};

exports.isValidDate = (dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

exports.getBusinessDays = (startDate, endDate) => {
  let count = 0;
  const curDate = new Date(startDate);
  const end = new Date(endDate);

  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { 
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }

  return count;
};

exports.formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
};

exports.getAge = (birthdate) => {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

exports.isWeekend = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
};

exports.getCurrentWeek = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(now.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: exports.startOfDay(monday),
    end: exports.endOfDay(sunday)
  };
};

exports.getCurrentMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: exports.startOfDay(start),
    end: exports.endOfDay(end)
  };
};

exports.getPhilippineDate = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
};

module.exports = exports;