import os
import psycopg
from psycopg.rows import dict_row

with psycopg.connect(os.environ['CHECKOUT_DATABASE_URL'], row_factory=dict_row) as connection:
    rights = connection.execute("""SELECT
      has_table_privilege(current_user,'club_settings','SELECT') AS settings,
      has_table_privilege(current_user,'directus_roles','UPDATE') AS roles,
      has_column_privilege(current_user,'directus_users','token','SELECT') AS legacy_token,
      has_column_privilege(current_user,'directus_users','role','UPDATE') AS elevation,
      has_column_privilege(current_user,'directus_users','password','UPDATE') AS password,
      has_table_privilege(current_user,'alumni','UPDATE') AS profile""").fetchone()
    assert rights == dict(settings=False, roles=False, legacy_token=False, elevation=False, password=True, profile=True)
print('SQL-права API: профиль и пароль разрешены; архив настроек, старые токены и смена ролей закрыты')
