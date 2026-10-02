# Remote Linux GUI on Android (Termux + proot-distro + VNC)

Set up a full Linux desktop (fluxbox) with a browser, running inside a proot
Ubuntu container on an Android phone, and view/control it from any other
device (another phone, a laptop) over VNC through an SSH tunnel.

**Assumes**: Termux is installed, `proot-distro install ubuntu` has already
been run, and SSH access into Termux is already working (e.g. via `sshd` on
Termux listening on some port, here `8022`).

## Overview

```
[Viewer device]  --SSH tunnel-->  [Server phone: Termux]
                                        |
                                   proot-distro login ubuntu
                                        |
                                   Xvfb (virtual display :1)
                                        |
                                   fluxbox (window manager)
                                        |
                                   x11vnc (serves :1 over VNC, localhost only)
                                        |
                                   falkon (browser, optional)
```

x11vnc only listens on `localhost` inside the container — it is never
exposed directly to the network. The SSH tunnel is what makes port 5900
reachable from the viewer device. This keeps the VNC server from being
open to anything else on the LAN.

## 1. One-time install (server phone, inside proot Ubuntu)

```bash
proot-distro login ubuntu
apt update
apt install -y xvfb x11vnc fluxbox
```

Browser (see "Browser notes" below for why this isn't a one-liner):

```bash
apt install -y falkon
```

If `apt install falkon` fails partway with `404 Not Found` on an unrelated
package (e.g. `libinput-bin`/`libinput10`), that's just a stale mirror
index, not a real problem — run `apt update` again and retry the install.

A terminal emulator, for opening a shell from inside the GUI itself
(fluxbox's right-click menu expects one):

```bash
apt install -y xterm
```

Without this, fluxbox's default "Terminal" menu entry fails with
`x-terminal-emulator: not found` — this proot Ubuntu image doesn't ship
one by default, and installing `xterm` alone may not be enough to satisfy
the `x-terminal-emulator` alias fluxbox's menu calls. If the menu item
still fails after installing `xterm`, register it explicitly:

```bash
update-alternatives --install /usr/bin/x-terminal-emulator x-terminal-emulator /usr/bin/xterm 50
```

(This step was flagged but not actually verified working — treat it as
the next thing to confirm, not a given.)

## 2. Start the desktop (server phone, every time after a reboot/kill)

Run each of these in the proot shell. `disown` detaches the job from the
shell so it survives the SSH session ending (it does NOT survive the
Termux app being killed by Android, or the phone rebooting).

```bash
Xvfb :1 -screen 0 1280x800x24 &
disown

DISPLAY=:1 x11vnc -display :1 -passwd CHANGE_ME -listen localhost -xkb &
disown

DISPLAY=:1 fluxbox &
disown
```

Replace `CHANGE_ME` with your own VNC password. `-listen localhost` is
important — it keeps x11vnc bound to loopback only, reachable solely
through the SSH tunnel. `-xkb` makes x11vnc use the X Keyboard Extension
for key event translation — without it, some keys/modifiers can map
incorrectly between the viewer device and the X server.

**Use `ps aux`, not `jobs`, to check what's running.** `jobs` only shows
background jobs started by the *current* shell — if you reconnect over a
fresh SSH session, `jobs` will show nothing even if Xvfb/x11vnc/fluxbox
are all still alive from an earlier session. This is the single most
confusing thing about this setup. Always check with:

```bash
ps aux | grep -E 'Xvfb|x11vnc|fluxbox' | grep -v grep
```

`jobs` is only useful to check processes you just started in the shell
you're currently typing into.

If `Xvfb :1 ...` fails with:

```
Fatal server error:
(EE) Server is already active for display 1
	If this server is no longer running, remove /tmp/.X1-lock
```

check `ps aux` first — if Xvfb is genuinely still running from before,
you don't need to restart it at all, just skip that line. Only remove the
stale lock file if `ps aux` confirms no Xvfb process is actually alive:

```bash
rm /tmp/.X1-lock
```

### Browser (optional, launch anytime after the desktop is up)

```bash
QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox" DISPLAY=:1 falkon &
disown
```

## 3. Connect from a viewer device (phone or laptop)

### Open the SSH tunnel

Replace the port/user/host with your own server phone's SSH details:

```bash
ssh -p 8022 -L 5900:localhost:5900 u0_xxx@192.168.1.20
```

Leave this session connected — it IS the tunnel. Closing it drops the
connection. On Android, use Termux + keep the app in foreground or hold
its wake-lock notification so the OS doesn't kill the SSH process.

### Open a VNC client

Any VNC viewer works (bVNC, RealVNC Viewer, TigerVNC Viewer, macOS Screen
Sharing — though Apple's own client has auth-negotiation quirks with
x11vnc; a dedicated viewer is more reliable).

Connect to:

- **Address**: `localhost` (or `127.0.0.1`)
- **Port**: `5900`
- **Password**: whatever you set as `CHANGE_ME` above

You should land on an empty fluxbox desktop (right-click for the fluxbox
menu) or see falkon's window if you started it.

## Notes, gotchas, and why some things are the way they are

- **Only one VNC client at a time.** This x11vnc setup does not use
  `-shared`. A second client connecting while one is active gets
  "denying additional client" in the x11vnc log. Disconnect one before
  connecting the other, or add `-shared` to the x11vnc command if you
  want concurrent viewers.

- **`-nopw` vs `-passwd`.** `-nopw` (no password) causes "invalid password
  or early disconnect" with some clients (notably macOS's built-in Screen
  Sharing) due to an auth-negotiation mismatch. Always set an actual
  password with `-passwd` — it's more broadly compatible.

- **Password not visible in `ps aux`.** x11vnc intentionally rewrites its
  own argv at runtime so other local users can't read the VNC password
  via `ps`. If `ps aux | grep x11vnc` doesn't show `-passwd ...`, that is
  expected — it doesn't mean the password wasn't set.

- **Processes surviving vs dying across sessions.** `Xvfb` and `fluxbox`
  often keep running even after you close the SSH session, because they
  were `disown`'d. `x11vnc` and any foregrounded app (like falkon run
  without `&`) are more likely to die when the session closes. Before
  restarting everything from scratch, check what's actually still alive:

  ```bash
  ps aux | grep -E 'Xvfb|x11vnc|fluxbox|falkon' | grep -v grep
  ```

  Only restart what's missing.

- **"another window manager already running on display :1"**. This means
  fluxbox (or another WM) is still alive from a previous session — don't
  start a second one. Just reconnect via VNC to the existing desktop.

- **EOFException / "Connection failed" in the VNC client, handshake never
  completes.** This usually means the SSH tunnel itself isn't actually up
  (e.g. the Termux SSH session silently dropped back to a local shell).
  Check the terminal running the `ssh -L ...` command first — re-establish
  it if it's not showing a live remote prompt.

- **An app launches with `&` but disappears / never shows a window, with
  no error printed.** Backgrounding hides the real crash output. Re-run
  the exact same command in the foreground (no trailing `&`) so any error
  prints directly to your terminal:

  ```bash
  DISPLAY=:1 some-app
  ```

  This is how the `bwrap`/sandbox failures in the browser section below
  were actually diagnosed — the backgrounded version just vanished with
  no visible reason, the foregrounded one printed the real error. Once
  you've found and fixed the cause, go back to backgrounding it with
  `& disown` for normal use.

## Browser notes (why Firefox/Chromium don't just work)

On Ubuntu specifically, `apt install chromium` and `apt install
firefox-esr`/`firefox` resolve to **snap-wrapped stubs**, not real
packages — and snap cannot run inside proot (no systemd, no squashfs
mount support). Installing them produces a `requires the chromium snap to
be installed` or "no installation candidate" error.

- **epiphany-browser** (GNOME Web) is a real `.deb` package, but on
  recent Ubuntu builds it hard-requires `bubblewrap` (`bwrap`) sandboxing
  to launch, which needs Linux user-namespace features proot can't
  provide (`bwrap: Can't bind mount ... Unable to find ... in mount
  table`). This is a dead end in proot.

- **falkon** (QtWebEngine/Chromium-based) works, but its embedded
  Chromium also wants its own sandbox. The CLI flag `--no-sandbox` is
  *not* enough on its own — it must be passed via the
  `QTWEBENGINE_CHROMIUM_FLAGS` environment variable so it reaches the
  embedded renderer process:

  ```bash
  QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox" DISPLAY=:1 falkon &
  ```

  On a successful launch you'll still see some noisy-looking but harmless
  warnings — these do NOT mean it failed:

  ```
  Failed to connect to the bus: Failed to connect to socket
  /run/dbus/system_bus_socket: No such file or directory
  Failed to initialize a udev monitor.
  Falkon: 1 extensions loaded
  ```

  The last line (`Falkon: 1 extensions loaded`) is the real signal it
  started. The D-Bus/udev lines are just proot not having a system bus or
  udev — neither is needed for falkon to render pages. Check the VNC
  screen for an actual window rather than judging success from the log
  alone.

  Falkon's `.deb` postinst script may also fail with `ln: No such file or
  directory` (some symlink/alternatives step proot doesn't support
  cleanly) — this leaves dpkg reporting the package as broken (`Sub-process
  /usr/bin/dpkg returned an error code (1)`), but the binary at
  `/usr/bin/falkon` is still fully usable; the failure is cosmetic for
  *running* falkon. It will, however, make apt complain about a broken
  package on every future `apt install`/`apt upgrade` until resolved. If
  that becomes annoying, try `apt --fix-broken install`; worst case it's
  safe to ignore indefinitely since the binary itself works fine.

- If you only need basic page rendering (no modern JS apps), `dillo` or
  `netsurf-gtk` install cleanly with no sandboxing requirement at all —
  but they can't render JS-heavy sites (e.g. Instagram's web app) usefully.

- **Cleaning up a failed/unwanted browser install.** If you installed
  `chromium-browser` before realizing it's just the snap stub, remove it
  to reclaim space:

  ```bash
  apt remove -y chromium-browser
  apt autoremove -y
  apt clean
  ```

  `autoremove` drops now-unneeded dependencies that were pulled in only
  for that package; `clean` clears apt's downloaded `.deb` cache (frees
  space generally, not just from this one package).

## Quick reference: full restart from nothing

```bash
proot-distro login ubuntu

Xvfb :1 -screen 0 1280x800x24 &
disown
DISPLAY=:1 x11vnc -display :1 -passwd CHANGE_ME -listen localhost -xkb &
disown
DISPLAY=:1 fluxbox &
disown
QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox" DISPLAY=:1 falkon &
disown

ps aux | grep -E 'Xvfb|x11vnc|fluxbox|falkon' | grep -v grep   # confirm all four are alive
```

Before running this block blindly, check what's already alive first —
`Xvfb` and `fluxbox` in particular tend to survive SSH disconnects, so
re-running their start commands when they're still up will just produce
a harmless "already active" / "another window manager already running"
error. Only (re)start what `ps aux` shows is actually missing.

From the viewer device:

```bash
ssh -p 8022 -L 5900:localhost:5900 u0_xxx@192.168.1.20
# then, in a VNC client: connect to localhost:5900
```
