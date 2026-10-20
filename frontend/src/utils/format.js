/**
 * Formatting utilities using Intl API for internationalization
 */

/**
 * Format a number with locale-aware formatting
 * @param {number} value - The number to format
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @param {object} options - Intl.NumberFormat options
 * @returns {string} Formatted number
 */
export function formatNumber(value, locale = 'en', options = {}) {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a date with locale-aware formatting
 * @param {Date|string|number} date - The date to format
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date
 */
export function formatDate(date, locale = 'en', options = {}) {
  const dateObj = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, options).format(dateObj);
}

/**
 * Format a date and time with locale-aware formatting
 * @param {Date|string|number} date - The date to format
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @returns {string} Formatted date and time
 */
export function formatDateTime(date, locale = 'en') {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  });
}

/**
 * Format a relative time (e.g., "2 days ago")
 * @param {Date|string|number} date - The date to format
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @returns {string} Formatted relative time
 */
export function formatRelativeTime(date, locale = 'en') {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now - dateObj) / 1000);

  if (typeof Intl.RelativeTimeFormat !== 'undefined') {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    
    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, 'second');
    } else if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    } else if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    } else if (diffInSeconds < 604800) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
    } else if (diffInSeconds < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 604800), 'week');
    } else if (diffInSeconds < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
    }
  }
  
  // Fallback for older browsers
  return formatDate(dateObj, locale);
}

/**
 * Format XLM amount with locale-aware number formatting
 * @param {number} amount - The XLM amount
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted XLM amount
 */
export function formatXLM(amount, locale = 'en', decimals = 2) {
  return formatNumber(amount, locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format a price with currency symbol
 * @param {number} amount - The amount
 * @param {string} currency - The currency code (default: 'XLM')
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @returns {string} Formatted price with currency
 */
export function formatPrice(amount, currency = 'XLM', locale = 'en') {
  const formattedAmount = formatNumber(amount, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7
  });
  return `${formattedAmount} ${currency}`;
}

/**
 * Format a percentage
 * @param {number} value - The value to format as percentage
 * @param {string} locale - The locale (e.g., 'en', 'ar', 'sw')
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, locale = 'en', decimals = 0) {
  return formatNumber(value, locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
