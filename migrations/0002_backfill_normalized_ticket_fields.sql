-- Backfill normalized identifier columns on ingested_tickets from the raw
-- hauler / truck_number / driver_name values. Logic mirrors the JS helper
-- normalizeKey(value) in server/sand-actuals/index.ts:
--   trim whitespace, lowercase, collapse any internal whitespace run to a
--   single space.
-- Idempotent — re-running this UPDATE against already-normalized rows is
-- a no-op.
UPDATE ingested_tickets
   SET normalized_hauler       = lower(regexp_replace(trim(hauler),       '\s+', ' ', 'g')),
       normalized_truck_number = lower(regexp_replace(trim(truck_number), '\s+', ' ', 'g')),
       normalized_driver_name  = lower(regexp_replace(trim(driver_name),  '\s+', ' ', 'g'))
 WHERE hauler       IS NOT NULL
    OR truck_number IS NOT NULL
    OR driver_name  IS NOT NULL;
