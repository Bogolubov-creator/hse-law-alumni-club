#!/usr/bin/env bash
# Настоящая установка в одноразовом Ubuntu runner после сборки live-образов.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
temp="$(sudo mktemp -d /tmp/club-install.XXXXXX)"
config="$temp/config"
compose=(sudo docker compose --env-file "$config/runtime.env" -f "$temp/repo/docker-compose.yml" -f "$temp/repo/deploy/compose.local.yml")
cleanup() {
  result=$?
  trap - EXIT
  # Маркер возникает только после проверки, что у проекта не было контейнеров/томов.
  if sudo test -f "$config/install.json"; then
    if ! "${compose[@]}" down --volumes --remove-orphans --timeout 30; then result=1; fi
  fi
  if ! sudo rm -rf -- "$temp"; then result=1; fi
  exit "$result"
}
trap cleanup EXIT
sudo git -c safe.directory="$repo" clone --local --no-hardlinks "$repo" "$temp/repo"
sudo "$temp/repo/scripts/install.sh" --local --config-dir "$config"
verify() {
  sudo python3 - "$config" "$1" <<'PY'
import hashlib, json, pathlib, ssl, sys, urllib.request
directory = pathlib.Path(sys.argv[1])
context = ssl.create_default_context(cafile=str(directory / 'local-ca.crt'))
credentials = dict(line.split(': ', 1) for line in (directory / 'initial-admin.txt').read_text().splitlines())
request = urllib.request.Request('https://localhost:9443/api/auth/admin-login',
    data=json.dumps({'email': credentials['Email'], 'password': credentials['Password']}).encode(),
    headers={'Content-Type': 'application/json', 'Origin': 'https://localhost:9443'})
with urllib.request.urlopen(request, context=context) as response:
    assert response.status == 200, 'Первичный пароль не даёт войти'
with urllib.request.urlopen('https://localhost:9443/api/ready', context=context) as response:
    assert json.load(response)['status'] == 'ok'
fingerprints = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                for name in ('runtime.env', 'operations.env', 'initial-admin.txt', 'install.json')}
snapshot = directory / 'test-config-fingerprints.json'
if sys.argv[2] == 'first': snapshot.write_text(json.dumps(fingerprints))
else: assert fingerprints == json.loads(snapshot.read_text()), 'Повторный запуск заменил конфигурацию'
print('Установка: доверенный TLS, readiness и вход администратора проверены; секреты не выведены')
PY
}
verify first
sudo "$temp/repo/scripts/install.sh" --local --config-dir "$config"
verify repeated
echo 'Повторная установка сохранила конфигурацию и доступ администратора'
