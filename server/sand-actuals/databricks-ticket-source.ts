import type { InsertIngestedTicket } from "@shared/schema";
import type {
  TicketSource,
  TicketSourceFetchOptions,
  TicketSourceFetchResult,
} from "./ticket-source";

type DatabricksColumn = { name: string };

type DatabricksStatementResponse = {
  statement_id?: string;
  status?: {
    state?: string;
    error?: {
      message?: string;
    };
  };
  manifest?: {
    schema?: {
      columns?: DatabricksColumn[];
    };
  };
  result?: {
    data_array?: unknown[][];
    next_chunk_internal_link?: string | null;
  };
};

export class DatabricksTicketSource implements TicketSource {
  public readonly name = "databricks";

  private readonly host: string;
  private readonly token: string;
  private readonly warehouseId: string;
  private readonly catalog?: string;
  private readonly schema?: string;

  constructor() {
    this.host = requiredEnv("DATABRICKS_HOST");
    this.token = requiredEnv("DATABRICKS_TOKEN");
    this.warehouseId = requiredEnv("DATABRICKS_WAREHOUSE_ID");
    this.catalog = process.env.DATABRICKS_CATALOG || undefined;
    this.schema = process.env.DATABRICKS_SCHEMA || undefined;
  }

  async fetchTickets(
    opts: TicketSourceFetchOptions,
  ): Promise<TicketSourceFetchResult> {
    const sql = buildSandTicketsSql(opts.lookbackHours);

    const initial = await this.executeStatement(sql);
    const completed = await this.pollUntilComplete(initial);

    const rows = await this.collectRows(completed);
    const tickets = rows.map(mapRowToIngestedTicket);

    const lastSeenAt =
      tickets
        .map((t) =>
          t.gpsDropoffCompletedAt ??
          t.haulerDropoffCompletedAt ??
          t.haulerServiceEndAt ??
          t.gpsPickupCompletedAt ??
          null,
        )
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? undefined;

    return {
      tickets,
      lastSeenAt,
    };
  }

  private async executeStatement(sql: string): Promise<DatabricksStatementResponse> {
    const response = await fetch(`${this.host}/api/2.0/sql/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouse_id: this.warehouseId,
        statement: sql,
        catalog: this.catalog,
        schema: this.schema,
        wait_timeout: "30s",
        disposition: "INLINE",
        format: "JSON_ARRAY",
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Databricks statement submit failed: ${response.status} ${raw}`);
    }

    return JSON.parse(raw) as DatabricksStatementResponse;
  }

  private async pollUntilComplete(
    current: DatabricksStatementResponse,
  ): Promise<DatabricksStatementResponse> {
    const statementId = current.statement_id;
    if (!statementId) {
      throw new Error("Databricks response missing statement_id");
    }

    for (let i = 0; i < 30; i++) {
      const state = current.status?.state;

      if (state === "SUCCEEDED") {
        return current;
      }

      if (state === "FAILED" || state === "CANCELED" || state === "CLOSED") {
        throw new Error(
          `Databricks statement ${state}: ${current.status?.error?.message ?? "unknown error"}`,
        );
      }

      await sleep(2000);

      const response = await fetch(
        `${this.host}/api/2.0/sql/statements/${statementId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Databricks statement poll failed: ${response.status} ${raw}`);
      }

      current = JSON.parse(raw) as DatabricksStatementResponse;
    }

    throw new Error("Databricks statement timed out waiting for completion");
  }

  private async collectRows(
    response: DatabricksStatementResponse,
  ): Promise<Record<string, unknown>[]> {
    const columns =
      response.manifest?.schema?.columns?.map((c) => c.name) ??
      response.result?.data_array?.[0]?.map((_v, i) => `col_${i}`) ??
      [];

    if (!columns.length) {
      return [];
    }

    let rows = (response.result?.data_array ?? []).map((row) =>
      arrayRowToObject(columns, row),
    );

    let next = response.result?.next_chunk_internal_link ?? null;

    while (next) {
      const chunkResponse = await fetch(`${this.host}${next}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const raw = await chunkResponse.text();
      if (!chunkResponse.ok) {
        throw new Error(`Databricks chunk fetch failed: ${chunkResponse.status} ${raw}`);
      }

      const chunk = JSON.parse(raw) as DatabricksStatementResponse;
      const chunkRows = (chunk.result?.data_array ?? []).map((row) =>
        arrayRowToObject(columns, row),
      );

      rows = rows.concat(chunkRows);
      next = chunk.result?.next_chunk_internal_link ?? null;
    }

    return rows;
  }
}

function buildSandTicketsSql(lookbackHours: number): string {
  const hours = Math.max(1, Math.floor(lookbackHours));

  // Source-of-truth change: this query now mirrors the morning report.
  //
  //   - Tickets come from gemini.eqt.tickets (not jarvis.trust.sand_tickets).
  //   - Pad attribution (Dev_Run_UID, Dev_Run_Name, Site_UID, Site_Name,
  //     Resource, Water_System) comes from an active_pads CTE over
  //     jarvis.rpt.glancer_mos, filtered to the current FRAC snapshot.
  //     The join on g.DestinationExternalId = p.site_uid is what produces
  //     identical counts to the morning report for loads, tons, cost,
  //     day/night split, truck counts, and cycle times.
  //   - All timestamps are converted to America/New_York via
  //     from_utc_timestamp before any date or hour is derived.
  //   - billable_time_hours is the GPS field cycle (pickup -> dropoff),
  //     filtered to [0.25, 18] hours to drop outliers.
  //   - duration_hours is the ticket cycle (GPSTicketStarted ->
  //     HaulerServiceEndTime), filtered to [0.25, 24] hours.
  //
  // The morning report uses from_utc_timestamp(HaulerServiceEndTime,
  // 'America/New_York')::date as the calendar report_date. The current
  // JS attribution path in server/sand-actuals/index.ts resolves the
  // effective timestamp with gps_dropoff_completed_at first and falls
  // back to hauler_service_end_at — that precedence will need to be
  // realigned to HaulerServiceEndTime-first once the schema carries the
  // upstream attribution columns (see TODO on mapRowToIngestedTicket).

  return `
with active_pads as (
  select
    Site_UID                             as site_uid,
    Site_Name                            as site_name,
    Dev_Run_UID                          as dev_run_uid,
    upper(trim(Dev_Run_Name))            as dev_run_name,
    Resource                             as resource_spread,
    Water_System                         as water_system
  from jarvis.rpt.glancer_mos
  where upper(trim(Milestone)) = 'FRAC'
    and RScriptLoadDate = (select max(RScriptLoadDate) from jarvis.rpt.glancer_mos)
    and current_date() between Start and Finish
)
select
  cast(g.TicketId as string)                                         as source_ticket_number,
  cast(g.DispatchId as string)                                       as source_dispatch_number,
  g.TicketStatus                                                     as ticket_status,
  g.LoadType                                                         as load_type,
  g.Material                                                         as material,
  null                                                               as operator,
  g.Hauler                                                           as hauler,
  g.DriverName                                                       as driver_name,
  g.TruckNumber                                                      as truck_number,
  g.TrailerNumber                                                    as trailer_number,
  g.SourceName                                                       as source_name,
  cast(g.SourceExternalId as string)                                 as source_external_id,
  g.SourceLocationType                                               as source_location_type,
  g.DestinationName                                                  as destination_name,
  cast(g.DestinationExternalId as string)                            as destination_external_id,
  g.DestinationLocationType                                          as destination_location_type,
  null                                                               as source_volume,
  try_cast(g.DestinationVolume as decimal(14,2))                     as destination_volume,
  'Tons'                                                             as volume_unit_of_measure,
  null                                                               as hauling_rate,
  null                                                               as cost_type,
  null                                                               as hauling_cost,
  null                                                               as total_npt_cost,
  try_cast(g.TotalTicketCost as decimal(14,2))                       as total_ticket_cost,
  round(
    case
      when (
        unix_timestamp(from_utc_timestamp(g.HaulerServiceEndTime, 'America/New_York'))
        - unix_timestamp(from_utc_timestamp(g.GPSTicketStarted,    'America/New_York'))
      ) / 3600.0 between 0.25 and 24
      then (
        unix_timestamp(from_utc_timestamp(g.HaulerServiceEndTime, 'America/New_York'))
        - unix_timestamp(from_utc_timestamp(g.GPSTicketStarted,    'America/New_York'))
      ) / 3600.0
      else null
    end
  , 2)                                                               as duration_hours,
  round(
    case
      when (
        unix_timestamp(from_utc_timestamp(g.GPSDropOffCompleted, 'America/New_York'))
        - unix_timestamp(from_utc_timestamp(g.GPSPickupCompleted, 'America/New_York'))
      ) / 3600.0 between 0.25 and 18
      then (
        unix_timestamp(from_utc_timestamp(g.GPSDropOffCompleted, 'America/New_York'))
        - unix_timestamp(from_utc_timestamp(g.GPSPickupCompleted, 'America/New_York'))
      ) / 3600.0
      else null
    end
  , 2)                                                               as billable_time_hours,
  null                                                               as npt_billable_hours,
  null                                                               as total_billable_time,
  from_utc_timestamp(g.GPSTicketStarted,      'America/New_York')    as gps_ticket_started_at,
  from_utc_timestamp(g.GPSPickupCompleted,    'America/New_York')    as gps_pickup_completed_at,
  from_utc_timestamp(g.GPSDropOffCompleted,   'America/New_York')    as gps_dropoff_completed_at,
  from_utc_timestamp(g.HaulerServiceStartTime,'America/New_York')    as hauler_service_start_at,
  from_utc_timestamp(g.HaulerServiceEndTime,  'America/New_York')    as hauler_service_end_at,
  from_utc_timestamp(g.GPSPickupCompleted,    'America/New_York')    as hauler_pickup_completed_at,
  from_utc_timestamp(g.GPSDropOffCompleted,   'America/New_York')    as hauler_dropoff_completed_at,
  null                                                               as failed_audit_reason,
  null                                                               as driver_comments,
  null                                                               as admin_comments,
  false                                                              as rerouted,
  false                                                              as flagged,
  p.dev_run_uid                                                      as upstream_dev_run_uid,
  p.dev_run_name                                                     as upstream_dev_run_name,
  null                                                               as upstream_driver_shift_id,
  null                                                               as upstream_miles_traveled,
  p.site_uid                                                         as site_uid,
  p.site_name                                                        as site_name,
  p.resource_spread                                                  as resource_spread,
  p.water_system                                                     as water_system
from gemini.eqt.tickets g
join active_pads p
  on p.site_uid = cast(g.DestinationExternalId as string)
where g.Material = 'Sand'
  and g.Hauler not in ('EQT Test Hauler', 'Gemini Hauling')
  and coalesce(g.HaulerServiceEndTime, g.GPSDropOffCompleted, g.GPSPickupCompleted, g.GPSTicketStarted)
      >= current_timestamp() - INTERVAL ${hours} HOURS
`;
}

// TODO(schema): the SQL now carries six Glancer-sourced attribution columns
// (upstreamDevRunUid, upstreamDevRunName, siteUid, siteName, resourceSpread,
// waterSystem) on every ticket row. These fields do NOT yet exist on the
// ingestedTickets table or on the InsertIngestedTicket Zod schema in
// shared/schema.ts. Until those are added (and a follow-up migration runs),
// upsertIngestedTicket() will fail at runtime the moment this mapper returns
// a row with the new keys because drizzle will try to insert into columns
// that don't exist.
//
// Required follow-up edits in shared/schema.ts:
//   ingestedTickets = pgTable("ingested_tickets", {
//     ...
//     upstreamDevRunUid:  text("upstream_dev_run_uid"),
//     upstreamDevRunName: text("upstream_dev_run_name"),
//     siteUid:            text("site_uid"),
//     siteName:           text("site_name"),
//     resourceSpread:     text("resource_spread"),
//     waterSystem:        text("water_system"),
//     ...
//   })
// Plus a drizzle-kit generate to emit the ALTER TABLE migration.
//
// Once those columns exist, server/sand-actuals/index.ts can be updated to
// prefer ticket.upstreamDevRunUid for attribution and retire the
// buildActivePadSnapshot(fracJobs) fallback.
function mapRowToIngestedTicket(row: Record<string, unknown>): InsertIngestedTicket {
  const ticket = {
    commodity: "sand",
    sourceTicketNumber: asRequiredString(row.source_ticket_number),
    sourceDispatchNumber: asNullableString(row.source_dispatch_number),
    ticketStatus: asNullableString(row.ticket_status),
    material: asNullableString(row.material),
    loadType: asNullableString(row.load_type),
    operator: asNullableString(row.operator),
    hauler: asNullableString(row.hauler),
    driverName: asNullableString(row.driver_name),
    truckNumber: asNullableString(row.truck_number),
    trailerNumber: asNullableString(row.trailer_number),
    sourceName: asNullableString(row.source_name),
    sourceExternalId: asNullableString(row.source_external_id),
    sourceLocationType: asNullableString(row.source_location_type),
    destinationName: asNullableString(row.destination_name),
    destinationExternalId: asNullableString(row.destination_external_id),
    destinationLocationType: asNullableString(row.destination_location_type),
    sourceVolume: asNullableDecimalString(row.source_volume),
    destinationVolume: asNullableDecimalString(row.destination_volume),
    volumeUnitOfMeasure: asNullableString(row.volume_unit_of_measure),
    haulingRate: asNullableDecimalString(row.hauling_rate),
    costType: asNullableString(row.cost_type),
    haulingCost: asNullableDecimalString(row.hauling_cost),
    totalNptCost: asNullableDecimalString(row.total_npt_cost),
    totalTicketCost: asNullableDecimalString(row.total_ticket_cost),
    durationHours: asNullableDecimalString(row.duration_hours),
    billableTimeHours: asNullableDecimalString(row.billable_time_hours),
    nptBillableHours: asNullableDecimalString(row.npt_billable_hours),
    totalBillableTime: asNullableDecimalString(row.total_billable_time),
    gpsTicketStartedAt: asNullableDate(row.gps_ticket_started_at),
    gpsPickupCompletedAt: asNullableDate(row.gps_pickup_completed_at),
    gpsDropoffCompletedAt: asNullableDate(row.gps_dropoff_completed_at),
    haulerServiceStartAt: asNullableDate(row.hauler_service_start_at),
    haulerServiceEndAt: asNullableDate(row.hauler_service_end_at),
    haulerPickupCompletedAt: asNullableDate(row.hauler_pickup_completed_at),
    haulerDropoffCompletedAt: asNullableDate(row.hauler_dropoff_completed_at),
    failedAuditReason: asNullableString(row.failed_audit_reason),
    driverComments: asNullableString(row.driver_comments),
    adminComments: asNullableString(row.admin_comments),
    rerouted: asBoolean(row.rerouted),
    flagged: asBoolean(row.flagged),

    // Glancer-join attribution hints — see TODO above. These keys are not yet
    // present on InsertIngestedTicket; the cast below intentionally lets them
    // flow through the mapper so the SQL selection, the mapper, and the
    // eventual schema/migration land in the same PR.
    upstreamDevRunUid: asNullableString(row.upstream_dev_run_uid),
    upstreamDevRunName: asNullableString(row.upstream_dev_run_name),
    siteUid: asNullableString(row.site_uid),
    siteName: asNullableString(row.site_name),
    resourceSpread: asNullableString(row.resource_spread),
    waterSystem: asNullableString(row.water_system),
  };

  return ticket as unknown as InsertIngestedTicket;
}

function arrayRowToObject(columns: string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    out[columns[i]] = row[i];
  }
  return out;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.replace(/\/+$/, "");
}

function asRequiredString(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    throw new Error("Missing required ticket identifier");
  }
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNullableDecimalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function asNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}