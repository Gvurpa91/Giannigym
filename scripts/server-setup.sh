#!/bin/sh
# One-time server setup, safe to run again:  sudo sh /opt/giannigym/scripts/server-setup.sh
#
# - installs the commands  giannigym-update  and  giannigym-backup
# - schedules the nightly backup (systemd timer, 03:17 server time, catches up after downtime)
# - turns on automatic security updates for the operating system
#   (dnf-automatic on Oracle Linux / RHEL / Fedora, unattended-upgrades on Ubuntu / Debian)
set -eu

[ "$(id -u)" = 0 ] || exec sudo sh "$0" "$@"
ROOT=$(CDPATH='' cd -- "$(dirname -- "$(readlink -f "$0")")/.." && pwd)

echo "== commands"
chmod +x "$ROOT/scripts/update.sh" "$ROOT/scripts/backup.sh"
ln -sf "$ROOT/scripts/update.sh" /usr/local/bin/giannigym-update
ln -sf "$ROOT/scripts/backup.sh" /usr/local/bin/giannigym-backup
echo "installed: run  giannigym-update  and  giannigym-backup  (without sudo — they ask for it themselves)"

echo "== nightly backup"
cat > /etc/systemd/system/giannigym-backup.service <<UNIT
[Unit]
Description=GianniGym data backup

[Service]
Type=oneshot
ExecStart=/bin/sh $ROOT/scripts/backup.sh
UNIT
cat > /etc/systemd/system/giannigym-backup.timer <<UNIT
[Unit]
Description=Nightly GianniGym data backup

[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now giannigym-backup.timer >/dev/null
systemctl list-timers giannigym-backup.timer --no-pager | sed -n '1,2p'

echo "== automatic security updates"
if command -v dnf >/dev/null 2>&1; then
  dnf -y -q install dnf-automatic
  CONF=/etc/dnf/automatic.conf
  sed -i 's/^upgrade_type *=.*/upgrade_type = security/; s/^apply_updates *=.*/apply_updates = yes/' "$CONF"
  systemctl enable --now dnf-automatic.timer >/dev/null
  echo "dnf-automatic: security updates applied daily ($(grep -E '^(upgrade_type|apply_updates)' "$CONF" | tr '\n' ' '))"
elif command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get -y -qq install unattended-upgrades >/dev/null
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
  echo "unattended-upgrades: security updates applied daily"
else
  echo "no dnf or apt-get found: set up automatic updates by hand" >&2
fi
echo "Kernel updates take effect after a reboot: 'sudo reboot' now and then (the app restarts by itself)."

echo "== done"
