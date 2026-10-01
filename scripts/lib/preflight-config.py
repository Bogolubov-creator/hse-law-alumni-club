import json
import socket
import subprocess
import sys
from urllib.parse import urlsplit
from ops_config import validate_local_services

config = json.load(sys.stdin)
services = config["services"]
errors = []
try: validate_local_services(config)
except (ValueError, KeyError): errors.append('API/bootstrap должны использовать локальную PostgreSQL и отдельную runtime-роль; проверьте адреса и учётные данные')
api = services["api"]["environment"]
if api.get("APP_ENV") != "production" or api.get("SEED_DEMO") != "false":
    errors.append("Деплой требует APP_ENV=production и SEED_DEMO=false")
bootstrap = services["bootstrap"]["environment"]
if bootstrap.get("APP_ENV") != "production" or bootstrap.get("SEED_DEMO") != "false":
    errors.append("Bootstrap требует APP_ENV=production и SEED_DEMO=false")
if services["api"].get("ports") or services["postgres"].get("ports"):
    errors.append("API и PostgreSQL не должны публиковать порты хоста")
for key in ("POSTGRES_PASSWORD",):
    value = services["postgres"]["environment"].get(key, "")
    if len(value) < 24 or any(part in value.lower() for part in ("replace_", "сгенер", "changeme")):
        errors.append(f"Замените {key} отдельным случайным секретом")
for value, label in ((api.get("PUBLIC_URL", ""), "PUBLIC_URL"),):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        errors.append(f"{label} должен быть корневым HTTPS-адресом")

owned = set()
ids = subprocess.check_output(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={config['name']}"], text=True).split()
if ids:
    for container in json.loads(subprocess.check_output(["docker", "inspect", *ids])):
        for bindings in container["NetworkSettings"]["Ports"].values():
            for binding in bindings or []:
                owned.add((binding["HostIp"], int(binding["HostPort"])))
for service in services.values():
    for binding in service.get("ports", []):
        if binding.get("protocol", "tcp") != "tcp": continue
        address, port = binding.get("host_ip", "0.0.0.0"), int(binding["published"])
        if (address, port) in owned: continue
        try:
            with socket.socket(socket.AF_INET6 if ":" in address else socket.AF_INET) as probe:
                probe.bind((address, port))
        except OSError:
            errors.append(f"Порт {address}:{port} занят вне текущего Compose-проекта")
if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print("Compose: конфигурация и порты проверены")
