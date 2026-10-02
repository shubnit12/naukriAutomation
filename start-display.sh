#!/bin/bash
# start-display.sh — idempotent Xvfb + x11vnc + fluxbox + falkon stack
set -e

pgrep -f "Xvfb :1" >/dev/null || {
  echo "Starting Xvfb..."
  Xvfb :1 -screen 0 1280x800x24 &
  disown
  sleep 2
}

pgrep -f "x11vnc.*:1" >/dev/null || {
  echo "Starting x11vnc..."
  DISPLAY=:1 x11vnc -display :1 -passwd YOUR_PASSWORD_HERE -listen localhost -xkb -forever &
  disown
  sleep 1
}

pgrep -x fluxbox >/dev/null || {
  echo "Starting fluxbox..."
  DISPLAY=:1 fluxbox &
  disown
  sleep 1
}

pgrep -x falkon >/dev/null || {
  echo "Starting falkon..."
  QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox" DISPLAY=:1 falkon &
  disown
}

echo "Display stack ready on :1 (VNC port 5901)"
