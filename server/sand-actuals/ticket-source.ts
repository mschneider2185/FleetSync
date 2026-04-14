import type { InsertIngestedTicket } from "@shared/schema";

/**
 * A TicketSource pulls raw sand tickets from an upstream system and hands them
 * back already mapped into the InsertIngestedTicket shape that DatabaseStorage
 * expects. This seam is deliberately stub-first: Slice 1 wires the full sync +
 * attribution + fact rebuild pipeline but does not yet perform Databricks IO.
 * A follow-up slice will ship a DatabricksTicketSource implementation behind
 * this same interface without changing anything in the sync orchestrator or
 * storage layer.
 */
export interface TicketSourceFetchOptions {
  lookbackHours: number;
  cursor?: string;
}

export interface TicketSourceFetchResult {
  tickets: InsertIngestedTicket[];
  nextCursor?: string;
  /** Most recent upstream event timestamp observed in this batch. */
  lastSeenAt?: Date;
}

export interface TicketSource {
  name: string;
  fetchTickets(opts: TicketSourceFetchOptions): Promise<TicketSourceFetchResult>;
}

let stubWarnIssued = false;

export const stubTicketSource: TicketSource = {
  name: "stub",
  async fetchTickets(_opts: TicketSourceFetchOptions): Promise<TicketSourceFetchResult> {
    if (!stubWarnIssued) {
      stubWarnIssued = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[sand-actuals] stubTicketSource is in use — no Databricks IO is wired yet. " +
          "Sync will run end-to-end over whatever ingested_tickets rows already exist.",
      );
    }
    return { tickets: [] };
  },
};
