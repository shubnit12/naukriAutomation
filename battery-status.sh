#!/data/data/com.termux/files/usr/bin/bash

# ==== EDIT THESE ====
BOT_TOKEN=""
CHAT_ID=""

# ====================

BAT=$(termux-battery-status)
PCT=$(echo "$BAT" | grep -o '"percentage": [0-9]*' | grep -o '[0-9]*')
STATUS=$(echo "$BAT" | grep -o '"status": "[A-Z_]*"' | cut -d'"' -f4)
TEMP=$(echo "$BAT" | grep -o '"temperature": [0-9.]*' | grep -o '[0-9.]*')

MSG="🔋 Battery: ${PCT}%
⚡ Status: ${STATUS}
🌡 Temp: ${TEMP}°C
🕐 $(date '+%d %b %I:%M %p')"

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  --data-urlencode text="${MSG}" > /dev/null
