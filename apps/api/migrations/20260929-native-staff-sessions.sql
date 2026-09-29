-- Поколение офисных сессий переживает рестарт API и меняется вместе со сбросом пароля.
CREATE TABLE IF NOT EXISTS club_staff_sessions (
  user_id uuid PRIMARY KEY REFERENCES directus_users(id) ON DELETE CASCADE,
  token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0)
);
