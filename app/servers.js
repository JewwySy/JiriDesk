// Which signaling addresses to try, in order. They all reach the same server,
// so the first one that answers wins: this PC, then the same network, then Tailscale.
const JiriServers = (() => {
  const OLD_DEFAULT = 'ws://localhost:3001';
  const DEFAULT_SERVERS = 'ws://localhost:3001, ws://192.168.1.133:3001, ws://100.81.71.70:3001';

  function parseServers(text) {
    const list = [...new Set(String(text).split(/[\s,]+/).filter(Boolean))];
    return list.length && list.every((s) => /^wss?:\/\/\S+$/.test(s)) ? list : null;
  }
  // An access key is only ever sent over wss://.
  function serversToTry(text, accessKey) {
    const list = parseServers(text) || [];
    return accessKey ? list.filter((s) => s.startsWith('wss://')) : list;
  }
  const migrateServers = (saved) => (saved === OLD_DEFAULT ? DEFAULT_SERVERS : saved);

  return { DEFAULT_SERVERS, parseServers, serversToTry, migrateServers };
})();
if (typeof module !== 'undefined') module.exports = JiriServers;
