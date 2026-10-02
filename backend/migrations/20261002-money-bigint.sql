BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE products ALTER COLUMN price TYPE bigint;
ALTER TABLE programs ALTER COLUMN price TYPE bigint;
ALTER TABLE orders ALTER COLUMN subtotal TYPE bigint;
ALTER TABLE orders ALTER COLUMN total_estimate TYPE bigint;
COMMIT;
