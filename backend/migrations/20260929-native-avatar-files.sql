BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.alumni IN SHARE MODE;
LOCK TABLE public.directus_files IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.directus_files f
    WHERE EXISTS (SELECT 1 FROM public.alumni a WHERE lower(a.avatar) = f.id::text)
      AND f.metadata IS NOT NULL
      AND jsonb_typeof(f.metadata::jsonb) NOT IN ('object', 'null')
  ) THEN
    RAISE EXCEPTION 'У legacy аватара metadata не является объектом: требуется проверка оператора';
  END IF;
END $$;

UPDATE public.directus_files f
SET metadata = (
  COALESCE(NULLIF(f.metadata::jsonb, 'null'::jsonb), '{}'::jsonb)
  || jsonb_build_object('club_upload_kind', 'avatar')
)::json
WHERE EXISTS (SELECT 1 FROM public.alumni a WHERE lower(a.avatar) = f.id::text)
  AND f.metadata::jsonb->>'club_upload_kind' IS DISTINCT FROM 'avatar';

COMMIT;
