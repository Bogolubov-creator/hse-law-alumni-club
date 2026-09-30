"""Отказ до любых изменений, если восстановление может задеть существующие данные."""
import json
import subprocess
import sys
from urllib.parse import urlsplit
from ops_config import validate_local_services


def validate(config, volume_exists):
    def require(condition, message):
        if not condition: raise ValueError(message)

    services = config['services']
    validate_local_services(config)
    env = services['api']['environment']
    require(services['bootstrap']['environment'].get('SEED_DEMO') == 'false', 'Bootstrap не должен добавлять демо-данные')
    networks = config.get('networks', {})
    require(networks.get('default', {}).get('internal') is True, 'Основная сеть восстановления должна быть internal')
    for network in networks.values():
        require(not network.get('external') and network.get('name', '').startswith(config['name']+'_'), 'Только новые сети проекта')
    for name in ('api', 'migrate', 'bootstrap', 'postgres'):
        require(set(services[name].get('networks', {})) == {'default'}, name + ': разрешена только изолированная основная сеть')
    require(env.get('JOBS_ENABLED') == 'false', 'Отключите планировщик в восстановленном стенде')
    require(env.get('SEED_DEMO') == 'false', 'Не добавляйте демо-данные при восстановлении')
    for key in ('TELEGRAM_BOT_TOKEN','OFFICE_TG_BOT_TOKEN','YOOKASSA_SECRET_KEY','VAPID_PRIVATE_KEY','SENTRY_DSN'):
        require(not env.get(key), f'Отключите {key}')
    require(env.get('SMTP_HOST') == 'mailpit' and 'mailpit' in services, 'Нужен локальный сервис mailpit')
    require(env.get('OFFICE_NOTIFY_CHANNEL') == 'email', 'Разрешены только письма в Mailpit')
    require(urlsplit(env['PUBLIC_URL']).hostname in ('localhost','127.0.0.1'), 'Только localhost')
    require(not services['api'].get('ports') and not services['postgres'].get('ports'), 'API/PG не публикуют порты')
    for service in services.values():
        require(not service.get('extra_hosts') and not service.get('network_mode') and not service.get('links'), 'Перенаправление сетевых имён запрещено')
        require(not service.get('volumes_from'), 'volumes_from запрещён при восстановлении')
        for port in service.get('ports', []):
            require(port.get('host_ip') == '127.0.0.1', 'Порты должны быть loopback')
    volumes = config.get('volumes', {})
    for volume in volumes.values():
        name = volume.get('name', '')
        require(not volume.get('external') and name.startswith(config['name']+'_'), 'Только новые тома проекта')
        require(not volume.get('driver_opts'), 'Перенаправление тома на существующий каталог запрещено')
        require(not volume_exists(name), f'Том {name} уже существует')
    for service, target in (('postgres','/var/lib/postgresql/data'),('api','/data/uploads')):
        mounts = [mount for mount in services[service].get('volumes', []) if mount['target'] == target]
        require(len(mounts) == 1 and mounts[0]['type'] == 'volume' and mounts[0]['source'] in volumes,
                f'{service}: данные должны идти в новый именованный том проекта')
        require(not any(mount['type'] == 'bind' for mount in services[service].get('volumes', [])),
                f'{service}: bind mounts при восстановлении запрещены')


if __name__ == '__main__':
    def exists(name):
        return subprocess.run(['docker','volume','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False).returncode == 0

    try: validate(json.load(sys.stdin), exists)
    except (ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    print('Изоляция восстановления проверена')
