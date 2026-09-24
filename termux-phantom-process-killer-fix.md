# Termux keeps dying with `[Process completed (signal 9)]` — cause and permanent fix

Applies to Termux on Android 12 and newer. No root required. Written after fixing a Samsung
Galaxy S10+ (Android 12, One UI 4.1) where Termux and sshd were killed every time a
Playwright/Chromium cron job ran.

---

## 1. What the problem is and how to confirm it

- **Symptom:** Termux prints `[Process completed (signal 9)] - press Enter` and your shell is
  gone. If you run sshd in Termux, SSH connections die at the same moment. It happens most when
  Termux is in the background or when something heavy is running.
- **Cause:** Android 12 and newer have a **phantom process killer**. Android counts every process
  that apps spawn outside the normal app process, caps them at **32 across the whole phone**, and
  SIGKILLs the oldest ones when the cap is exceeded. Termux is almost always the only app spawning
  such processes, so the cap is effectively Termux's alone. The oldest processes are your
  interactive shell and sshd, so they die first.
- **Confirm it.** In Termux, count your processes:

  ```bash
  ps -e | wc -l
  ```

  If the number is near or above 32 while the kills happen, this is your problem. Running proot
  distros, headless Chromium, Node, cron, or several sessions gets you there fast. Our case was
  37 to 48 processes.

- **Find your Android API level**, which decides the commands later:

  ```bash
  getprop ro.build.version.sdk
  ```

  | API level | Android version |
  |---|---|
  | 31 | 12 |
  | 32 | 12L |
  | 33 | 13 |
  | 34 | 14 |
  | 35 | 15 |

---

## 2. The fix, step by step

The fix is one Android system flag. It needs adb, but **not root**, and it survives reboots.
You need a **second device** to run adb from — a computer or another Android phone. The affected
phone is called the *target* below.

### Step 1. Prepare the second device

- **Another Android phone:** install Termux from F-Droid or from the Termux GitHub releases page
  (not the Play Store, whose build is outdated). Then run:

  ```bash
  pkg update -y && pkg install -y android-tools
  ```

- **Mac:** `brew install --cask android-platform-tools`
- **Debian / Ubuntu:** `sudo apt install adb`
- **Windows:** download "SDK Platform-Tools" from the Android developer site, unzip, run
  `adb.exe` from that folder.
- Check `adb --version` shows **30 or higher**. Older adb cannot do Wi-Fi pairing.
- Both devices must be on the **same Wi-Fi network**. Guest networks that isolate clients from
  each other will not work.
- **Only one phone?** Try running the fix from the target phone itself first: install
  `android-tools` in its Termux, open Recents, tap the Termux icon, choose **Open in split screen
  view** with Settings in the other half (Termux must stay visible, or Android kills it), and use
  `localhost` as the target IP in Step 3. This works on many phones. If adb answers
  `cannot connect to daemon` no matter what (it did on our S10+), the local client is broken and
  you do need a second device.

### Step 2. Enable Wireless debugging on the target phone

1. Settings → About phone (on Samsung: then Software information). Tap **Build number** seven
   times, enter your PIN. Developer options is now enabled.
2. Settings → Developer options (on Pixel it is under System). Turn on **Wireless debugging**.
   Confirm the prompt.
3. Tap the words "Wireless debugging" to open its screen. Note the **IP address & Port** line.
   That port is the **connect port**.
4. Tap **Pair device with pairing code**. A dialog shows a 6-digit code and a second, different
   port. That is the **pairing port**. Leave this dialog open until pairing finishes — the code
   dies when the dialog closes.

### Step 3. Run the fix from the second device

Save this as `fix-phantom.sh`. On a computer, change the first line to `#!/bin/bash` and delete
the `pkg install` line.

```bash
#!/data/data/com.termux/files/usr/bin/bash
# Usage: bash fix-phantom.sh <target-phone-ip>
set -u
TARGET=${1:?usage: bash fix-phantom.sh <target-phone-ip>}
command -v adb >/dev/null 2>&1 || pkg install -y android-tools
adb start-server >/dev/null 2>&1

echo "Target: Settings > Developer options > Wireless debugging > Pair device with pairing code"
read -rp "Pairing PORT shown in that dialog: " PAIRPORT
adb pair "$TARGET:$PAIRPORT" || { echo "Pairing failed. Reopen the dialog for a fresh code and rerun."; exit 1; }

echo "Close the dialog. Read 'IP address & Port' on the main Wireless debugging screen."
read -rp "Connect PORT from the main screen: " CONNPORT
DEV="$TARGET:$CONNPORT"
adb connect "$DEV" || exit 1
adb devices | grep -q "$DEV.*device" || { echo "Not connected:"; adb devices; exit 1; }

SDK=$(adb -s "$DEV" shell getprop ro.build.version.sdk | tr -d '\r')
echo "Target API level: $SDK"
echo "Before:"; adb -s "$DEV" shell "/system/bin/dumpsys activity settings" | grep max_phantom_processes

if [ "$SDK" -ge 32 ]; then
  adb -s "$DEV" shell "settings put global settings_enable_monitor_phantom_procs false"
fi
adb -s "$DEV" shell "/system/bin/device_config set_sync_disabled_for_tests persistent"
adb -s "$DEV" shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"
adb -s "$DEV" shell "dumpsys deviceidle whitelist +com.termux"

echo "After:"; adb -s "$DEV" shell "/system/bin/dumpsys activity settings" | grep max_phantom_processes
echo "Done. Survives reboots. You can turn Wireless debugging off."
```

Run it with the target's IP, for example:

```bash
bash fix-phantom.sh 192.168.1.20
```

It asks for the pairing port, then adb asks for the 6-digit code, then it asks for the connect
port. The "After" line must show:

```
max_phantom_processes=2147483647
```

### Step 4. Verify the lock against resets

Android 12 stores this flag where Google's flag sync can overwrite it, which is why the script
disables sync. Confirm it:

```bash
adb shell device_config is_sync_disabled_for_tests
```

- Android 12 prints `true`.
- Android 13 and newer: the command is `get_sync_disabled_for_tests` and prints `persistent`.

### Step 5. Optional, on the target phone

- Settings → Apps → Termux → Battery → **Unrestricted**.
- On Samsung, also add Termux to **Never sleeping apps**.
- In the Termux notification, tap **Acquire wakelock**.

These stop other background kills that are not the phantom killer.

### Step 6. Test that the fix worked

On the target phone, open Termux and push the process count past the old limit, for example:

```bash
for i in $(seq 1 40); do sleep 600 & done; ps -e | wc -l
```

The count should print above 40. Now press Home, use other apps for five minutes, then return to
Termux. Before the fix, the session would be dead with `signal 9`. After the fix, your shell is
still there. Clean up with `pkill sleep`.

---

## 3. Troubleshooting, undo, and workaround

| Problem | Fix |
|---|---|
| `adb pair` fails or times out | The pairing dialog closed, so the code expired. Reopen it and rerun. Check both devices are on the same Wi-Fi. |
| `adb connect` says offline / failed to authenticate | Turn Wireless debugging off and on (this changes the connect port), then pair again. |
| `adb devices` lists more than one device | Add `-s <ip:port>` after `adb` in every command. The script already does this. |
| Target phone's own Termux adb says `cannot connect to daemon` or `ADB server didn't ACK` | Happened on our S10+ and could not be fixed. Don't fight it — use a second device as the adb host. |
| `device_config` says unknown command / permission denied | You ran it in Termux directly. It only works inside `adb shell`. |
| Problem returns after a system update or factory reset | Run the script again. It takes two minutes. |

**To undo everything:**

```bash
adb shell "device_config delete activity_manager max_phantom_processes"
adb shell "device_config set_sync_disabled_for_tests none"
adb shell "settings delete global settings_enable_monitor_phantom_procs"
```

**No second device at all:** the only workaround is staying under 32 processes. Stop heavy jobs
such as headless Chromium, or run them one at a time. The kills stop the moment the count drops.

---

## Result on the phone this was written for

| | Before fix | After fix (measured) |
|---|---|---|
| `max_phantom_processes` | 32 (default) | 2147483647 |
| Child processes under Termux | 37, kills began past 32 | 48, nothing killed |
| Shell after 4 min in background | killed (signal 9) | alive, same PID |
| sshd after 4 min in background | killed | alive, same PID |
