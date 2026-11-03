// Small decisions used during a remote session, shared by the window and the main process.
const JiriSession = (() => {
  const LAN_BITRATE = 30000000;

  // Only the newest of consecutive mouse moves matters; a backlog is what makes the pointer feel slow.
  function coalesceInput(events) {
    const out = [];
    for (const ev of events) {
      if (ev.type === 'move' && out.length && out[out.length - 1].type === 'move') out[out.length - 1] = ev;
      else out.push(ev);
    }
    return out;
  }

  function safeFileName(name) {
    const base = String(name).split(/[\\/]/).pop()
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '')
      .slice(0, 200);
    if (!base) return 'file';
    return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(base) ? `_${base}` : base;
  }

  function chunkRanges(size, chunk) {
    const out = [];
    for (let at = 0; at < size; at += chunk) out.push([at, Math.min(at + chunk, size)]);
    return out;
  }

  // Tailscale addresses are also "host" candidates, but that traffic may cross the internet.
  const isTailscale = (address) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(String(address || ''));
  function isLanPath(local, remote) {
    if (!local || !remote || local.candidateType !== 'host') return false;
    if (isTailscale(local.address) || isTailscale(remote.address)) return false;
    return remote.candidateType === 'host' || remote.candidateType === 'prflx';
  }
  const qualityFor = (lan, chosen) => (lan ? LAN_BITRATE : chosen);

  function heldKeysTracker() {
    const held = new Set();
    return {
      down: (code) => held.add(code),
      up: (code) => held.delete(code),
      releaseAll() {
        const codes = [...held];
        held.clear();
        return codes;
      },
    };
  }

  // x and y run from 0 to 1 across the monitor. The last pixel is width - 1; width itself is the next monitor.
  const displayPoint = (bounds, x, y) => ({
    x: bounds.x + Math.min(Math.round(x * bounds.width), bounds.width - 1),
    y: bounds.y + Math.min(Math.round(y * bounds.height), bounds.height - 1),
  });

  // A browser reports about 100 per notch. Windows counts 120 per notch; other systems count notches.
  const wheelAmount = (delta, platform) => Math.ceil(Math.abs(delta) * (platform === 'win32' ? 1.2 : 0.01));

  return { coalesceInput, safeFileName, chunkRanges, isLanPath, qualityFor, heldKeysTracker, displayPoint, wheelAmount };
})();
if (typeof module !== 'undefined') module.exports = JiriSession;
