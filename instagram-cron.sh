#!/data/data/com.termux/files/usr/bin/bash
# instagram-cron.sh <spec-file> [extra playwright flag, e.g. --debug or --headed]
proot-distro login ubuntu -- bash -lc "~/start-display.sh && cd ~/naukriAutomation && DISPLAY=:1 npx playwright test tests/$1 --project=chromium $2 --reporter=line >> ~/naukriAutomation/cron.log 2>&1"
