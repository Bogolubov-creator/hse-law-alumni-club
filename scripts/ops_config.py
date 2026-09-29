"""Проверка, что приложение использует БД и CMS своего Compose-проекта."""
from urllib.parse import unquote, urlsplit


def validate_local_services(config):
    services = config['services']
    api = services['api']['environment']
    cms = services['directus']['environment']
    pg = services['postgres']['environment']
    migration = services['migrate']['environment']
    if api.get('DIRECTUS_URL', '').rstrip('/') != 'http://directus:8055':
        raise ValueError('API должен использовать локальный http://directus:8055')
    if (cms.get('DB_HOST') != 'postgres' or str(cms.get('DB_PORT')) != '5432'
            or cms.get('DB_DATABASE') != pg['POSTGRES_DB']
            or cms.get('DB_USER') != pg['POSTGRES_USER']
            or cms.get('DB_PASSWORD') != pg['POSTGRES_PASSWORD']):
        raise ValueError('Directus должен использовать PostgreSQL своего Compose-проекта')
    sql = urlsplit(api.get('CHECKOUT_DATABASE_URL', ''))
    if (sql.scheme not in ('postgres', 'postgresql') or sql.hostname != 'postgres'
            or sql.port not in (None, 5432) or unquote(sql.path) != '/'+pg['POSTGRES_DB']
            or unquote(sql.username or '') != migration.get('CHECKOUT_DB_USER')
            or sql.username == pg['POSTGRES_USER']
            or unquote(sql.password or '') != migration.get('CHECKOUT_DB_PASSWORD')
            or not sql.password or sql.query or sql.fragment):
        raise ValueError('API должен использовать отдельную SQL-роль и локальную БД postgres:5432')
