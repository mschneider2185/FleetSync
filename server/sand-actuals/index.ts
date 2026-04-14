import type { IStorage } from "../storage";
import type { FracJob, IngestedTicket, InsertTicketAttribution } from "@shared/schema";
import { stubTicketSource, type TicketSource } from "./ticket-source";

export const DEFAULT_ATTRIBUTION_METHOD = "active_pad_snapshot_site_uid";

export interface RunSandTicketSyncOptions {
  storage: IStorage;
  userId: string | null;
  lookbackHours?: number;
  rebuildFacts?: boolean;
  rebuildFrom?: string | null;
  rebuildTo?: string | null;
  dryRun?: boolean;
  source?: TicketSource;
  now?: Date;
}

export interface RunSandTicketSyncResult {
  syncRunId: number;
  status: "succeeded" | "partial" | "failed";
  rowsRead: number;
  rowsWritten: number;
  rowsUpdated: number;
  rowsSkipped: number;
  attributionsWritten: number;
  factRowsRebuilt: number;
  window: { from: string | null; to: string | null };
  dryRun: boolean;
  source: string;
  errorMessage?: string;
}

/**
 * End-to-end sand ticket sync:
 *   1. open sync_runs row
 *   2. fetch tickets from the configured TicketSource and upsert into ingested_tickets
 *   3. rebuild ticket_attributions for the effective window
 *   4. rebuild fact_frac_day_actuals for the same window (optional)
 *   5. close out the sync_runs row
 */
export async function runSandTicketSync(
  opts: RunSandTicketSyncOptions,
): Promise<RunSandTicketSyncResult> {
  const {
    storage,
    userId,
    lookbackHours = 48,
    rebuildFacts = true,
    rebuildFrom = null,
    rebuildTo = null,
    dryRun = false,
    source = stubTicketSource,
    now = new Date(),
  } = opts;

  const attributionMethod = DEFAULT_ATTRIBUTION_METHOD;

  const syncRun = await storage.createSyncRun({
    source: "sand_tickets",
    trigger: "manual",
    status: "running",
    requestPayload: { lookbackHours, rebuildFacts, rebuildFrom, rebuildTo, dryRun },
    triggeredByUserId: userId,
  });

  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  let attributionsWritten = 0;
  let factRowsRebuilt = 0;
  let windowFrom: string | null = rebuildFrom;
  let windowTo: string | null = rebuildTo;
  let lastSeenAt: Date | undefined;
  let status: "succeeded" | "partial" | "failed" = "succeeded";
  let errorMessage: string | undefined;

  try {
    // 1. Fetch and upsert tickets
    const batch = await source.fetchTickets({ lookbackHours });
    rowsRead = batch.tickets.length;
    lastSeenAt = batch.lastSeenAt;

    if (!dryRun) {
      for (const ticket of batch.tickets) {
        try {
          const { inserted } = await storage.upsertIngestedTicket(ticket);
          if (inserted) rowsWritten++;
          else rowsUpdated++;
        } catch (err) {
          rowsSkipped++;
          // eslint-disable-next-line no-console
          console.error("[sand-actuals] upsert failed", err);
        }
      }
    }

    // 2. Determine attribution window
    const observedDates = deriveWindowFromBatch(batch.tickets);
    if (!windowFrom && observedDates.from) windowFrom = observedDates.from;
    if (!windowTo && observedDates.to) windowTo = observedDates.to;

    // 3. Attribution + fact rebuild (only when we have a window)
    if (!dryRun && windowFrom && windowTo) {
      const fracJobs = await storage.getFracJobs();
      const activePadSnapshot = buildActivePadSnapshot(fracJobs);

      await storage.deleteTicketAttributionsForCalendarWindow(
        windowFrom,
        windowTo,
        attributionMethod,
      );

      const ticketsForWindow = await storage.getIngestedSandTicketsForAttribution(
        windowFrom,
        windowTo,
      );

      for (const ticket of ticketsForWindow) {
        const attribution = attributeTicket({
          ticket,
          activePadSnapshot,
          attributionMethod,
          syncRunId: syncRun.id,
        });
        if (!attribution) continue;
        await storage.createTicketAttribution(attribution);
        attributionsWritten++;
      }

      if (rebuildFacts) {
        await storage.deleteFactFracDayActualsForCalendarWindow(
          windowFrom,
          windowTo,
          attributionMethod,
        );
        factRowsRebuilt = await storage.rebuildFactFracDayActualsForCalendarWindow(
          windowFrom,
          windowTo,
          attributionMethod,
          syncRun.id,
        );
      }
    }

    if (rowsSkipped > 0) status = "partial";
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await storage.completeSyncRun(syncRun.id, {
    status,
    endedAt: new Date(),
    rowsRead,
    rowsWritten,
    rowsUpdated,
    rowsSkipped,
    lastSeenAt: lastSeenAt ?? now,
    errorMessage: errorMessage ?? null,
  });

  return {
    syncRunId: syncRun.id,
    status,
    rowsRead,
    rowsWritten,
    rowsUpdated,
    rowsSkipped,
    attributionsWritten,
    factRowsRebuilt,
    window: { from: windowFrom, to: windowTo },
    dryRun,
    source: source.name,
    errorMessage,
  };
}

// --- Attribution helpers ------------------------------------------------------

interface ActivePadSnapshotEntry {
  fracJobId: number;
  padName: string;
  siteUid: string;
}

function buildActivePadSnapshot(fracJobs: FracJob[]): Map<string, ActivePadSnapshotEntry> {
  // For Slice 1 we approximate the "active pad snapshot" from the current
  // frac_jobs rows. The key is the normalized pad name, which is what the
  // Databricks ticket destination maps to in the absence of a dedicated
  // site UID registry. A follow-up slice will replace this with a proper
  // snapshot table once it lands.
  const map = new Map<string, ActivePadSnapshotEntry>();
  for (const job of fracJobs) {
    if (!job.padName) continue;
    const key = normalizeKey(job.padName);
    map.set(key, {
      fracJobId: job.id,
      padName: job.padName,
      siteUid: `frac-job-${job.id}`,
    });
  }
  return map;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

interface EffectiveTimestampResult {
  at: Date;
  precedenceFieldUsed: string;
}

export function resolveEffectiveTimestamp(ticket: IngestedTicket): EffectiveTimestampResult | null {
  // Precedence order locked in Slice 1:
  //   1. gps_dropoff_completed_at  (ground truth — GPS confirmed unload)
  //   2. hauler_dropoff_completed_at (hauler-reported unload)
  //   3. hauler_service_end_at       (end of billed service window)
  //   4. gps_pickup_completed_at     (fallback — at least we know it ran)
  const candidates: Array<[string, Date | null | undefined]> = [
    ["gps_dropoff_completed_at", ticket.gpsDropoffCompletedAt ?? null],
    ["hauler_dropoff_completed_at", ticket.haulerDropoffCompletedAt ?? null],
    ["hauler_service_end_at", ticket.haulerServiceEndAt ?? null],
    ["gps_pickup_completed_at", ticket.gpsPickupCompletedAt ?? null],
  ];

  for (const [field, value] of candidates) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { at: value, precedenceFieldUsed: field };
    }
  }
  return null;
}

interface AttributeTicketOptions {
  ticket: IngestedTicket;
  activePadSnapshot: Map<string, ActivePadSnapshotEntry>;
  attributionMethod: string;
  syncRunId: number | null;
}

function attributeTicket(opts: AttributeTicketOptions): InsertTicketAttribution | null {
  const { ticket, activePadSnapshot, attributionMethod, syncRunId } = opts;
  const eff = resolveEffectiveTimestamp(ticket);
  if (!eff) return null;

  const local = eff.at;
  const calendarReportDate = toDateString(local);
  const operationalDayDate = toOperationalDayString(local);
  const hour = local.getHours();
  const dayPart = hour >= 6 && hour < 18 ? "day" : "night";

  const key = ticket.destinationName ? normalizeKey(ticket.destinationName) : null;
  const match = key ? activePadSnapshot.get(key) : undefined;

  return {
    ingestedTicketId: ticket.id,
    syncRunId,
    attributionMethod,
    attributionStatus: match ? "attributed" : "unmatched",
    exclusionReason: match ? null : "no active pad snapshot match",
    precedenceFieldUsed: eff.precedenceFieldUsed,
    effectiveEventAtLocal: local,
    effectiveEventAtUtc: local,
    calendarReportDate,
    operationalDayDate,
    dayPart,
    hourLocal: hour,
    devRunUid: match?.siteUid ?? null,
    devRunName: match?.padName ?? null,
    fracJobId: match?.fracJobId ?? null,
    siteUid: match?.siteUid ?? null,
    siteName: match?.padName ?? null,
    resourceSpread: null,
    waterSystem: null,
    attributionConfidence: match ? "1.00" : "0.00",
    activePadSnapshotLoadedAt: new Date(),
  };
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Operational day runs 06:00 → 06:00. A ticket between 00:00 and 05:59 belongs
// to the previous operational day.
function toOperationalDayString(d: Date): string {
  if (d.getHours() < 6) {
    const shifted = new Date(d.getTime());
    shifted.setDate(shifted.getDate() - 1);
    return toDateString(shifted);
  }
  return toDateString(d);
}

function deriveWindowFromBatch(
  tickets: { gpsDropoffCompletedAt?: Date | null; haulerServiceEndAt?: Date | null }[],
): { from: string | null; to: string | null } {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const t of tickets) {
    const candidate = t.gpsDropoffCompletedAt ?? t.haulerServiceEndAt ?? null;
    if (!candidate) continue;
    if (!min || candidate < min) min = candidate;
    if (!max || candidate > max) max = candidate;
  }
  return {
    from: min ? toDateString(min) : null,
    to: max ? toDateString(max) : null,
  };
}
