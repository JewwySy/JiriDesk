const { build, Platform, Arch } = require('electron-builder');
const config = require('./package.json').build;
const feed = process.env.JIRIDESK_UPDATE_URL;
const publisherName = process.env.JIRIDESK_UPDATE_PUBLISHER?.trim();
let url;
try { url = new URL(feed); } catch {}
if (url?.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !publisherName) {
  console.error('Set JIRIDESK_UPDATE_URL to an HTTPS release directory and JIRIDESK_UPDATE_PUBLISHER to the code-signing certificate subject name.');
  process.exit(1);
}
build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    ...config,
    forceCodeSigning: true,
    artifactName: 'JiriDesk-${version}-${arch}-Setup.${ext}',
    directories: { output: 'release' },
    publish: [{ provider: 'generic', url: url.href, publisherName: [publisherName] }],
  },
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
