const getClientIp = (req) => {
  // Check for X-Forwarded-For header
  if (req.headers['x-forwarded-for']) {
    // The header can contain multiple IPs (client, proxy1, proxy2, ...).
    // The first one is the original client IP.
    const ips = req.headers['x-forwarded-for'].split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Fallback to standard IP properties
  return req.ip || req.connection.remoteAddress || 'unknown';
};

module.exports = {
  getClientIp
};
