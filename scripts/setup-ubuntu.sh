#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" = 0 ]] || { echo 'Запустите через sudo' >&2; exit 1; }
source /etc/os-release
[[ "$ID" = ubuntu && "$VERSION_ID" = 24.04 ]] || { echo 'Поддерживается Ubuntu 24.04 LTS' >&2; exit 1; }
[[ $# = 0 || ( $# = 1 && "$1" = --mariadb ) ]] || { echo 'Использование: setup-ubuntu.sh [--mariadb]' >&2; exit 1; }
APT_LOCK_TIMEOUT_SECONDS=300
ubuntu_apt() {
  DEBIAN_FRONTEND=noninteractive apt-get -o "DPkg::Lock::Timeout=$APT_LOCK_TIMEOUT_SECONDS" -o Acquire::Retries=3 "$@"
}
packages=(git curl ca-certificates openssl tar gzip python3 util-linux rclone jq rsync gnupg)
if [[ "${1:-}" = --mariadb ]]; then packages+=(mariadb-server mariadb-client); fi
echo "Зависимости Ubuntu: при автообновлении ожидание блокировки APT – до $APT_LOCK_TIMEOUT_SECONDS с."
ubuntu_apt update
ubuntu_apt install -y --no-install-recommends "${packages[@]}"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! docker buildx version >/dev/null 2>&1; then
  if dpkg-query -W docker.io podman-docker 2>/dev/null | grep -q .; then
    echo 'Обнаружен другой Docker-пакет; согласуйте его миграцию по docs.docker.com' >&2
    exit 1
  fi
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 0644 /etc/apt/keyrings/docker.asc
  source_file="$(mktemp)"
  trap 'rm -f "$source_file"' EXIT
  cat > "$source_file" <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  if [[ -f /etc/apt/sources.list.d/docker.sources ]]; then
    cmp -s "$source_file" /etc/apt/sources.list.d/docker.sources || { echo 'Существующий Docker source отличается; проверьте его вручную' >&2; exit 1; }
  else
    install -m 0644 "$source_file" /etc/apt/sources.list.d/docker.sources
  fi
  ubuntu_apt update
  ubuntu_apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker version --format '{{.Server.Version}}'
docker compose version
docker buildx version
echo 'Зависимости Ubuntu, Docker Engine, Compose и Buildx готовы.'
