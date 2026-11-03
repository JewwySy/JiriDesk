# Running on the office PC

The JiriDesk Signaling scheduled task runs `run-hidden.vbs`, which runs `Start-TailscaleSignaling.ps1`. The task starts at logon and is retried every minute, and the script restarts the server if it exits. Starts, exits and errors are in `logs\signaling.log`.

To load new server code, stop the `node.exe server.js` process. The script starts the new code within 5 seconds.

# JiriDesk private internet signaling

Create a Render Free Web Service from a private Git repository containing this project. Use root directory server, build command npm ci, and start command node server.js. Set HOST to 0.0.0.0 so Render can reach the service. Render supplies PORT and TLS.

In the Cloudflare Realtime dashboard, create a TURN key. Set the following as private Render environment variables:

- JIRIDESK_ACCESS_KEY: a random shared secret of at least 32 characters. Set the same value on both JiriDesk clients.
- CF_TURN_KEY_ID: Cloudflare TURN key ID.
- CF_TURN_API_TOKEN: Cloudflare TURN key secret. Store it on Render only.

Install a build containing the current app code on both devices. In Settings > Connection set the service URL using wss:// and enter the shared access key. On the laptop, connect to the office PC's Remote ID and approve the connection on the office PC or use its existing unattended access password.

Verify both devices show Online and test from separate networks. Use WebRTC connection stats to check for a relay candidate pair if testing TURN specifically. Render Free can sleep while idle. A sleeping office PC cannot accept a session.
