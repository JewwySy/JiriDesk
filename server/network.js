// Devices are only listed to each other when they reach this server from this PC or a private network.
function isOfficeAddress(address) {
  const ip = String(address || '').replace(/^::ffff:/, '');
  return ip === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

module.exports = { isOfficeAddress };
