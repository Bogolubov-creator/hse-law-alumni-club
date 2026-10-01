from urllib.parse import unquote, urlsplit


def validate_local_services(config):
    services = config['services']
    for name in ('api', 'migrate', 'bootstrap', 'postgres'):
        service = services[name]
        if service.get('extra_hosts') or service.get('network_mode') or service.get('links'):
            raise ValueError(name + ': запрещено перенаправлять сетевые имена локальных сервисов')
    api = services['api']['environment']
    pg = services['postgres']['environment']
    migration = services['migrate']['environment']
    bootstrap = services['bootstrap']['environment']
    for name, settings in (('migrate', migration), ('bootstrap', bootstrap)):
        if (settings.get('PGHOST') != 'postgres' or settings.get('PGDATABASE') != pg['POSTGRES_DB']
                or settings.get('PGUSER') != pg['POSTGRES_USER'] or settings.get('PGPASSWORD') != pg['POSTGRES_PASSWORD']
                or settings.get('BOOTSTRAP_DATABASE_URL') or settings.get('DATABASE_URL')
                or settings.get('PGHOSTADDR') or settings.get('PGSERVICE') or settings.get('PGSERVICEFILE')
                or str(settings.get('PGPORT', '5432')) != '5432'):
            raise ValueError(name + ': разрешена только PostgreSQL своего Compose-проекта')
    sql = urlsplit(api.get('CHECKOUT_DATABASE_URL', ''))
    if (sql.scheme not in ('postgres', 'postgresql') or sql.hostname != 'postgres'
            or sql.port not in (None, 5432) or unquote(sql.path) != '/'+pg['POSTGRES_DB']
            or unquote(sql.username or '') != migration.get('CHECKOUT_DB_USER')
            or sql.username == pg['POSTGRES_USER']
            or unquote(sql.password or '') != migration.get('CHECKOUT_DB_PASSWORD')
            or not sql.password or sql.query or sql.fragment):
        raise ValueError('API должен использовать отдельную SQL-роль и локальную БД postgres:5432')
