#!/data/data/com.termux/files/usr/bin/bash
# Run from the prepdesk folder. Keeps phone awake, serves files, opens a quick tunnel.
termux-wake-lock
python -m http.server 8080 &
cloudflared tunnel --url http://localhost:8080
