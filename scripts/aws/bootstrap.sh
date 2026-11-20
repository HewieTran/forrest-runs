#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -un)" == ubuntu ]] || { echo 'Run this as ubuntu in the Lightsail SSH terminal.' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
read -r -p 'Paste the dedicated GitHub deployment PUBLIC key: ' public_key
if [[ ! "$public_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]]; then
  echo 'Expected an ssh-ed25519 public key.' >&2; exit 1
fi
printf '%s\n' "$public_key" | ssh-keygen -lf /dev/stdin >/dev/null
sudo install -d -m 0755 /usr/local/lib/forrest-runs-deploy
sudo install -m 0755 "$script_dir/receiver.py" /usr/local/lib/forrest-runs-deploy/receiver.py
mkdir -p "$HOME/.ssh" "$HOME/.local/share/forrest-runs-deploy"
chmod 700 "$HOME/.ssh" "$HOME/.local/share/forrest-runs-deploy"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
key_data="$(printf '%s\n' "$public_key" | awk '{print $2}')"
if ! awk -v key="$key_data" '$0 ~ key {found=1} END {exit !found}' "$HOME/.ssh/authorized_keys"; then
  printf 'restrict,command="/usr/bin/python3 /usr/local/lib/forrest-runs-deploy/receiver.py" %s\n' "$public_key" >> "$HOME/.ssh/authorized_keys"
fi
echo 'Deployment receiver installed. Keep this public host-key line for the GitHub variable AWS_BETA_KNOWN_HOSTS:'
printf '3.132.106.53 '
cut -d ' ' -f 1,2 /etc/ssh/ssh_host_ed25519_key.pub
