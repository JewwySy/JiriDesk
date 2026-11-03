# JiriDesk Windows updates

Users with an older installer need to install the first update-enabled release once. After that, the app checks for a newer release when it opens and once an hour while running. It downloads in the background and only installs after the user clicks **Update & restart**. Disconnect remote sessions before restarting.

1. Use a stable HTTPS release directory that Electron can read without browser login, and a Windows code-signing certificate. The private ChatGPT Site is the landing page; its browser download does not serve the native updater feed.
2. In PowerShell in the app directory, set `$env:JIRIDESK_UPDATE_URL` to the HTTPS release directory and `$env:JIRIDESK_UPDATE_PUBLISHER` to the certificate publisher name. Configure signing for electron-builder and keep the same publisher for subsequent releases.
3. Bump the version in package.json and package-lock.json (for example, `npm version patch --no-git-tag-version`). Run `npm run dist:release`. The build refuses to produce an unsigned release.
4. Upload the versioned EXE and its blockmap from release/ before uploading latest.yml. Retain the previous blockmap for differential downloads and prevent stale caching of latest.yml. Link the first signed installer on the website. Once an updater-enabled build is installed, users need no website visit for later releases.
5. Smoke test with two consecutive signed builds: install the older one, publish the newer one to the test feed, wait for the banner, click Update & restart, and confirm the app reopens on the new version. Verify the install still works when the connection drops and resumes on a later check.

macOS auto-update can be added after a signed and notarized Mac release exists. Regular unsigned Windows preview builds (`npm run dist`) have no update feed.
