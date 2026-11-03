# Run the JiriDesk download site on this PC

Double-click Start-Site.cmd. Keep its window and this PC running.
Open http://localhost:8080 on this PC. On the same Wi-Fi, use http://YOUR-PC-IP:8080 (find your IPv4 address using ipconfig).
LAN access depends on the Windows firewall. No firewall rules, router forwarding, or automatic startup were changed.
This is HTTP local-network hosting, not a public internet URL. For public distribution, use HTTPS hosting and a separate large-file download host (the EXE is 125.4 MB). Do not expose this development server directly using router port forwarding.

The site serves only HTML, CSS and the installer. Run `node serve.cjs --test` for server checks.

## Release status

The Windows EXE was already present. Its version/publisher metadata is absent and its signature is NotSigned. Its SHA-256 is displayed on the download page. It has not been installed or certified for the latest Windows release during this task.
No Mac installer exists. `npm run dist:mac` in ../app prepares separate Apple silicon and Intel DMGs when run on macOS with dependencies installed. Build output stays in app/dist. Signing/notarization credentials and real Mac testing, including Screen Recording and Accessibility permissions for remote control, are still required. Only link a Mac artifact after it exists and is verified.
The app defaults to ws://localhost:3001. Remote access across computers requires a reachable signaling service configured in the app; hosting this website does not deploy that service.
