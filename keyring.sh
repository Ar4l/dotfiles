#!/bin/bash
# Set up a headless-unlockable gnome-keyring (Secret Service) on Linux.
# CLIs that store tokens in a keyring (e.g. JetBrains `central`) need an
# unlocked default collection; over plain ssh nothing unlocks it for you.
# Safe to rerun. Invoked via `make keyring`, not by `make all`: it needs
# sudo once, which not every server grants.
#
# 1. apt-installs gnome-keyring + dbus-user-session
# 2. generates a keyring password at ~/.config/keyring-pass (0600)
# 3. installs ~/.local/bin/keyring-unlock + a systemd user unit that
#    starts gnome-keyring-daemon unlocked at boot
# 4. enables lingering, so the unit runs without an active login session
#
# Why a password file instead of an empty-password keyring: gnome-keyring
# won't create or unlock a keyring from empty stdin, and headless creation
# prompts are auto-dismissed without a GUI prompter.

set -e

if [[ "$OSTYPE" == "darwin"* ]]; then
  echo 'macOS has its own keychain; nothing to do'
  exit 0
fi

# 1. Packages (the only sudo steps, together with enable-linger below)
if ! command -v gnome-keyring-daemon &> /dev/null; then
  sudo apt-get install -y gnome-keyring dbus-user-session
fi

# 2. Keyring password, generated once per machine
umask 077
mkdir -p ~/.config ~/.local/bin ~/.config/systemd/user ~/.local/share/keyrings
[ -f ~/.config/keyring-pass ] ||
  head -c 24 /dev/urandom | base64 > ~/.config/keyring-pass

# Point the Secret Service default alias at the login keyring; gnome-keyring
# creates that keyring on the unit's first --unlock run
[ -f ~/.local/share/keyrings/default ] ||
  echo -n login > ~/.local/share/keyrings/default

# 3. Unlock script + systemd user unit
cat > ~/.local/bin/keyring-unlock <<'EOF'
#!/bin/sh
# Start gnome-keyring-daemon with the login keyring unlocked (headless).
# Creates the login keyring on first run. Installed by dotfiles/keyring.sh.
tr -d "\n" < "$HOME/.config/keyring-pass" |
  /usr/bin/gnome-keyring-daemon --replace --unlock --components=secrets --daemonize
EOF
chmod 700 ~/.local/bin/keyring-unlock

cat > ~/.config/systemd/user/keyring-unlock.service <<'EOF'
[Unit]
Description=gnome-keyring secrets daemon, auto-unlocked for headless use

[Service]
Type=forking
ExecStart=%h/.local/bin/keyring-unlock
RemainAfterExit=yes

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now keyring-unlock.service
systemctl --user restart keyring-unlock.service   # pick up changes on reruns

# 4. Keep the user manager (and thus the daemon) alive across reboots
sudo loginctl enable-linger "$USER"

# Verify: the default collection must report unlocked
sleep 1
locked=$(busctl --user get-property org.freedesktop.secrets \
  /org/freedesktop/secrets/aliases/default \
  org.freedesktop.Secret.Collection Locked)
if [ "$locked" = 'b false' ]; then
  echo 'keyring OK: default collection is unlocked'
else
  echo "keyring NOT unlocked (Locked=$locked)" >&2
  exit 1
fi
