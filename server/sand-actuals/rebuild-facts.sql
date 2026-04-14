-- Rebuild fact_frac_day_actuals rows for a calendar window and attribution method.
--
-- Grain:  dev_run_uid × calendar_report_date × operational_day_date × attribution_method
--
-- Parameters (positional, bound from DatabaseStorage.rebuildFactFracDayActualsForCalendarWindow):
--   $1 = fromDate           (date, inclusive)
--   $2 = toDate             (date, inclusive)
--   $3 = attributionMethod  (text)
--   $4 = syncRunId          (integer or NULL)
--
-- Assumes the caller has already deleted existing fact rows in the same window
-- via deleteFactFracDayActualsForCalendarWindow() so this is a pure INSERT.

INSERT INTO fact_frac_day_actuals (
  sync_run_id,
  dev_run_uid,
  dev_run_name,
  frac_job_id,
  site_uid,
  site_name,
  resource_spread,
  water_system,
  calendar_report_date,
  operational_day_date,
  delivered_load_count,
  delivered_tons,
  delivered_total_cost,
  cost_per_ton,
  avg_field_cycle_hours,
  avg_ticket_cycle_hours,
  participating_truck_count,
  active_driver_count,
  day_load_count,
  night_load_count,
  core_truck_count_2plus,
  core_truck_count_3plus,
  attribution_method
)
SELECT
  $4::integer                                                                   AS sync_run_id,
  ta.dev_run_uid                                                                AS dev_run_uid,
  COALESCE(MAX(ta.dev_run_name), ta.dev_run_uid)                                AS dev_run_name,
  MAX(ta.frac_job_id)                                                           AS frac_job_id,
  MAX(ta.site_uid)                                                              AS site_uid,
  MAX(ta.site_name)                                                             AS site_name,
  MAX(ta.resource_spread)                                                       AS resource_spread,
  MAX(ta.water_system)                                                          AS water_system,
  ta.calendar_report_date                                                       AS calendar_report_date,
  ta.operational_day_date                                                       AS operational_day_date,
  COUNT(*)::integer                                                             AS delivered_load_count,
  COALESCE(SUM(it.destination_volume), 0)                                       AS delivered_tons,
  COALESCE(SUM(it.total_ticket_cost), 0)                                        AS delivered_total_cost,
  ROUND(
    CASE
      WHEN COALESCE(SUM(it.destination_volume), 0) > 0
        THEN SUM(it.total_ticket_cost) / NULLIF(SUM(it.destination_volume), 0)
      ELSE NULL
    END
  , 2)                                                                          AS cost_per_ton,
  AVG(it.billable_time_hours)                                                   AS avg_field_cycle_hours,
  AVG(it.duration_hours)                                                        AS avg_ticket_cycle_hours,
  COUNT(DISTINCT it.normalized_truck_number)
    FILTER (WHERE it.normalized_truck_number IS NOT NULL)::integer              AS participating_truck_count,
  COUNT(DISTINCT it.normalized_driver_name)
    FILTER (WHERE it.normalized_driver_name IS NOT NULL)::integer               AS active_driver_count,
  COUNT(*) FILTER (WHERE ta.day_part = 'day')::integer                          AS day_load_count,
  COUNT(*) FILTER (WHERE ta.day_part = 'night')::integer                        AS night_load_count,
  (
    SELECT COUNT(*) FROM (
      SELECT it2.normalized_truck_number
      FROM ticket_attributions ta2
      JOIN ingested_tickets it2 ON it2.id = ta2.ingested_ticket_id
      WHERE ta2.dev_run_uid = ta.dev_run_uid
        AND ta2.calendar_report_date = ta.calendar_report_date
        AND ta2.operational_day_date = ta.operational_day_date
        AND ta2.attribution_method = ta.attribution_method
        AND ta2.attribution_status = 'attributed'
        AND it2.normalized_truck_number IS NOT NULL
      GROUP BY it2.normalized_truck_number
      HAVING COUNT(*) >= 2
    ) t2
  )::integer                                                                    AS core_truck_count_2plus,
  (
    SELECT COUNT(*) FROM (
      SELECT it3.normalized_truck_number
      FROM ticket_attributions ta3
      JOIN ingested_tickets it3 ON it3.id = ta3.ingested_ticket_id
      WHERE ta3.dev_run_uid = ta.dev_run_uid
        AND ta3.calendar_report_date = ta.calendar_report_date
        AND ta3.operational_day_date = ta.operational_day_date
        AND ta3.attribution_method = ta.attribution_method
        AND ta3.attribution_status = 'attributed'
        AND it3.normalized_truck_number IS NOT NULL
      GROUP BY it3.normalized_truck_number
      HAVING COUNT(*) >= 3
    ) t3
  )::integer                                                                    AS core_truck_count_3plus,
  ta.attribution_method                                                         AS attribution_method
FROM ticket_attributions ta
JOIN ingested_tickets it ON it.id = ta.ingested_ticket_id
WHERE ta.attribution_status = 'attributed'
  AND ta.attribution_method = $3
  AND ta.dev_run_uid IS NOT NULL
  AND ta.calendar_report_date >= $1::date
  AND ta.calendar_report_date <= $2::date
GROUP BY ta.dev_run_uid, ta.calendar_report_date, ta.operational_day_date, ta.attribution_method
