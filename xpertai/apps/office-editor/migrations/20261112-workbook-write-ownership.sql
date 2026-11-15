-- Run with native workbook and generic Workspace writes paused, before reopening
-- the upgraded host. No business snapshots, revisions or ACLs are changed.
-- This is a forward-only catalog policy backfill; retain it during rollback.
DO $migration$
DECLARE
  entry record;
  root_path text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('office-editor:write-ownership:' || current_schema(), 0));
  IF to_regclass('content_resource_entry') IS NULL THEN RETURN; END IF;
  LOCK TABLE content_resource_entry IN SHARE ROW EXCLUSIVE MODE;
  FOR entry IN SELECT * FROM content_resource_entry WHERE "providerKey" = 'office-editor.workbooks' LOOP
    root_path := '.xpert/spreadsheets/' || entry."resourceId";
    -- Exact provider/model declarations authorize this migration, never a title
    -- or filename heuristic. Invalid legacy metadata needs provider refresh.
    IF entry."typeId" IS DISTINCT FROM 'xpert.spreadsheet'
      OR entry."modelId" IS DISTINCT FROM 'office-editor.univer-workbook'
      OR jsonb_typeof(entry."offlineSnapshot") IS DISTINCT FROM 'object'
      OR entry."offlineSnapshot"->>'typeId' IS DISTINCT FROM 'xpert.spreadsheet'
      OR entry."offlineSnapshot"->>'modelId' IS DISTINCT FROM 'office-editor.univer-workbook'
      OR entry."offlineSnapshot"->>'projectId' IS DISTINCT FROM entry."projectId"::text
      OR entry."offlineSnapshot"->'source'->>'kind' IS DISTINCT FROM 'bundle'
      OR entry."offlineSnapshot"->'source'->>'rootPath' IS DISTINCT FROM root_path
      OR entry."offlineSnapshot"->'containedPaths' IS DISTINCT FROM
        jsonb_build_array(jsonb_build_object('path', root_path, 'recursive', true)) THEN
      RAISE EXCEPTION 'Office workbook catalog metadata requires provider refresh before upgrade';
    END IF;
  END LOOP;
  UPDATE content_resource_entry
    SET "offlineSnapshot" = jsonb_set("offlineSnapshot", '{writeOwnership}', '"provider"'::jsonb)
    WHERE "providerKey" = 'office-editor.workbooks'
      AND "offlineSnapshot"->>'writeOwnership' IS DISTINCT FROM 'provider';
END $migration$;
