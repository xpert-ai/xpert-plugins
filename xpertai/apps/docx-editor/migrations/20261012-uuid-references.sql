-- Run before TypeORM synchronization when upgrading legacy DOCX tables.
-- One atomic statement: invalid values or dependencies roll back every conversion.
-- Resolves tables in current_schema(), preserves rows, nullability, indexes and FKs.
DO $migration$
DECLARE
  schema_name text := current_schema();
  table_names text[] := ARRAY['plugin_docx_editor_document', 'plugin_docx_editor_operation',
    'plugin_docx_editor_snapshot', 'plugin_docx_editor_version'];
  table_ids oid[] := ARRAY[]::oid[];
  table_name text;
  table_id oid;
  field record;
  constraint_row record;
  restore_commands text[] := ARRAY[]::text[];
  command text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('docx-editor:uuid-references:' || schema_name, 0));

  FOREACH table_name IN ARRAY table_names LOOP
    table_id := to_regclass(format('%I.%I', schema_name, table_name));
    IF table_id IS NOT NULL THEN
      EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE', schema_name, table_name);
      table_ids := array_append(table_ids, table_id);
    END IF;
  END LOOP;

  -- Validate all affected columns before changing any of them. Do not print row values.
  FOR field IN
    SELECT c.oid AS table_id, c.relname AS table_name, a.attname AS column_name, a.atttypid
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.oid = ANY(table_ids) AND NOT a.attisdropped
      AND (a.attname = 'projectId' OR (c.relname <> 'plugin_docx_editor_document' AND a.attname = 'documentId'))
  LOOP
    IF field.atttypid NOT IN ('uuid'::regtype, 'varchar'::regtype, 'text'::regtype) THEN
      RAISE EXCEPTION 'Unsupported type for %.%', field.table_name, field.column_name;
    END IF;
    BEGIN
      EXECUTE format('SELECT %I::uuid FROM %I.%I WHERE %I IS NOT NULL',
        field.column_name, schema_name, field.table_name, field.column_name);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid UUID values in %.%; no data was changed', field.table_name, field.column_name;
    END;
  END LOOP;

  -- PostgreSQL cannot alter FK column types while the constraint exists.
  -- Only temporarily remove constraints owned by these DOCX tables, then restore exactly.
  FOR constraint_row IN
    SELECT DISTINCT con.oid, con.conname, con.conrelid, ns.nspname, cls.relname,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE con.contype = 'f' AND EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.oid = ANY(table_ids) AND NOT a.attisdropped
        AND a.atttypid IN ('varchar'::regtype, 'text'::regtype)
        AND (a.attname = 'projectId' OR (c.relname <> 'plugin_docx_editor_document' AND a.attname = 'documentId'))
        AND ((con.conrelid = c.oid AND a.attnum = ANY(con.conkey))
          OR (con.confrelid = c.oid AND a.attnum = ANY(con.confkey)))
    )
    ORDER BY con.oid
  LOOP
    IF NOT (constraint_row.conrelid = ANY(table_ids)) THEN
      RAISE EXCEPTION 'External foreign key % requires a coordinated migration; no data was changed', constraint_row.conname;
    END IF;
    restore_commands := array_append(restore_commands, format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      constraint_row.nspname, constraint_row.relname, constraint_row.conname, constraint_row.definition));
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      constraint_row.nspname, constraint_row.relname, constraint_row.conname);
  END LOOP;

  FOR field IN
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.oid = ANY(table_ids) AND NOT a.attisdropped
      AND a.atttypid IN ('varchar'::regtype, 'text'::regtype)
      AND (a.attname = 'projectId' OR (c.relname <> 'plugin_docx_editor_document' AND a.attname = 'documentId'))
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE uuid USING %I::uuid',
      schema_name, field.table_name, field.column_name, field.column_name);
  END LOOP;

  FOREACH command IN ARRAY restore_commands LOOP
    EXECUTE command;
  END LOOP;
END
$migration$;
