# Remote Desktop App – Plano

## Layunin
Remote desktop na kagaya ng AnyDesk: ID + password, screen share, remote control, walang account.

## Arkitektura
- **Signaling server** (Node + `ws`): nagpapalitan lang ng WebRTC offer/answer/ICE sa pagitan ng dalawang peer gamit ang session ID.
- **Peer-to-peer WebRTC**: video ng screen + data channel para sa input, clipboard, chat.
- **TURN (coturn)**: fallback kapag hindi makakonekta nang diretso.
- **Desktop app (Electron)**: host at viewer. Native input injection (nut-js).

## Mga yugto
1. **Prototype (ngayon):** web page + signaling. Host ay nagshe-share ng screen, viewer ay nanonood gamit ang 6-digit code. Pinapatunayan ang WebRTC flow. Walang remote control pa.
2. **MVP:** Electron app. `desktopCapturer`, mouse/keyboard injection, accept/deny prompt, session password.
3. **Dagdag:** clipboard, file transfer, chat, permissions (view-only/control).
4. **Production:** TURN server, TLS, rate limiting, installer, auto-update, Tagalog UI.

## Seguridad
- WebRTC ay naka-encrypt (DTLS-SRTP).
- Host dapat mag-approve ng bawat koneksyon.
- Code ay random, may expiry, at isang gamit lang.
- Rate limit sa signaling para hindi ma-brute force ang code.

## Mga panganib
- Input injection sa Windows para sa elevated windows (UAC) ay nangangailangan ng service/admin.
- Latency sa mahihirap na network: kailangan ng TURN at bitrate control.
- Pangalan ng app: mamaya.
