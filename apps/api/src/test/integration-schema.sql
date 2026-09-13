-- Минимальный контракт коллекций Directus для транзакционных тестов.
-- Служебные таблицы создаются настоящими миграциями, не копиями DDL.
DO $$ BEGIN
  IF current_database() <> 'alumni_staged' THEN
    RAISE EXCEPTION 'Only alumni_staged is allowed';
  END IF;
END $$;
CREATE TABLE alumni (
  id uuid PRIMARY KEY, verification_status varchar(255), points_cached integer,
  personal_discount integer
);
CREATE TABLE products (
  id uuid PRIMARY KEY, slug varchar(255) UNIQUE, title varchar(255), price integer,
  stock integer, status varchar(255), variants_json json
);
CREATE TABLE programs (
  id uuid PRIMARY KEY, slug varchar(255) UNIQUE, title varchar(255), price integer,
  status varchar(255), enrollment varchar(255), source_url varchar(255)
);
CREATE TABLE carts (
  id uuid PRIMARY KEY, session_token varchar(255), items_json json, updated_at timestamptz
);
CREATE TABLE orders (
  id uuid PRIMARY KEY, number varchar(255) UNIQUE, alumni_id uuid REFERENCES alumni(id),
  type varchar(255), items_json json, subtotal integer, member_discount integer,
  total_estimate integer, contact_fio varchar(255), contact_phone varchar(255),
  contact_email varchar(255), fulfillment varchar(255), address text, comment text,
  consent_pdn boolean, status varchar(255), payment_status varchar(255), created_at timestamptz
);
