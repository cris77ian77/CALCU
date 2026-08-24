#!/bin/bash
# ============================================================
# kiosk.sh — Arranca el navegador a pantalla completa mostrando
# la pantalla de cobro, y lo reinicia solo si se cierra o crashea.
#
# No lo ejecutes a mano: lo llama el autostart (ver README.md de
# esta carpeta). Pensado para Raspberry Pi OS.
# ============================================================

URL="http://localhost/cobro-qr/index.html"
# Si la pantalla de cobro se sirve por internet (ej. GitHub Pages)
# en vez de local, cambiá la URL de arriba por la real, por ejemplo:
# URL="https://calculadora.frigoinsumos.com/cobro-qr/index.html"

CHROMIUM=$(command -v chromium-browser || command -v chromium)

# Apaga el protector de pantalla y el apagado de monitor (X11)
xset s off
xset s noblank
xset -dpms

# Oculta el cursor del mouse cuando no se mueve (necesita "unclutter")
if command -v unclutter >/dev/null; then
  unclutter -idle 0.5 -root &
fi

while true; do
  "$CHROMIUM" \
    --kiosk "$URL" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --incognito

  # Si Chromium se cierra solo (crash, "Aw, Snap!", etc.) esperamos
  # un segundo y lo volvemos a abrir, para que la máquina nunca quede
  # sin pantalla de cobro.
  sleep 1
done
