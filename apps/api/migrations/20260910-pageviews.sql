BEGIN;
-- Агрегаты просмотров страниц (без IP/UA/user id): день UTC + нормализованный path.

CREATE TABLE IF NOT EXISTS club_page_views (
  day date NOT NULL,
  path text NOT NULL,
  hits int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE INDEX IF NOT EXISTS club_page_views_day_idx ON club_page_views (day DESC);

COMMIT;
