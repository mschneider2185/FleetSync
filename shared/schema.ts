import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  real,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const lanes = pgTable("lanes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  parentScenarioId: integer("parent_scenario_id"),
  locked: boolean("locked").notNull().default(false),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const fracJobs = pgTable("frac_jobs", {
  id: serial("id").primaryKey(),
  padName: text("pad_name").notNull(),
  laneId: integer("lane_id").notNull(),
  customer: text("customer"),
  basin: text("basin"),
  notes: text("notes"),
  stagesPerDay: real("stages_per_day"),
  tonsPerStage: integer("tons_per_stage"),
  totalStages: integer("total_stages"),
  travelTimeHours: real("travel_time_hours"),
  avgTonsPerLoad: real("avg_tons_per_load"),
  loadUnloadTimeHours: real("load_unload_time_hours"),
  storageType: text("storage_type"),
  storageCapacity: integer("storage_capacity"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scenarioFracSchedules = pgTable("scenario_frac_schedules", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull(),
  fracJobId: integer("frac_job_id").notNull(),
  plannedStartDate: text("planned_start_date").notNull(),
  plannedEndDate: text("planned_end_date").notNull(),
  transitionDaysAfter: integer("transition_days_after").notNull().default(0),
  requiredTrucksPerShift: integer("required_trucks_per_shift").notNull().default(0),
  truckRequirementOverrides: text("truck_requirement_overrides"),
  status: text("status").notNull().default("planned"),
});

export const haulers = pgTable("haulers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  splitAllowed: boolean("split_allowed").notNull().default(false),
  homeArea: text("home_area"),
  notes: text("notes"),
  defaultMaxTrucksPerShift: integer("default_max_trucks_per_shift").notNull().default(10),
  defaultMinCommittedTrucksPerShift: integer("default_min_committed_trucks_per_shift").notNull().default(0),
  isActive: boolean("is_active").default(true),
});

export const haulerCapacityExceptions = pgTable("hauler_capacity_exceptions", {
  id: serial("id").primaryKey(),
  haulerId: integer("hauler_id").notNull(),
  date: text("date").notNull(),
  maxTrucksPerShift: integer("max_trucks_per_shift"),
  minCommittedTrucksPerShift: integer("min_committed_trucks_per_shift"),
  reason: text("reason"),
});

export const allocationBlocks = pgTable("allocation_blocks", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull(),
  fracJobId: integer("frac_job_id").notNull(),
  haulerId: integer("hauler_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  trucksPerShift: integer("trucks_per_shift").notNull(),
  shift: text("shift").notNull().default("both"),
});

export const presets = pgTable("presets", {
  id: serial("id").primaryKey(),
  presetType: text("preset_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data").notNull(),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const fracDailyEvents = pgTable("frac_daily_events", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull(),
  fracJobId: integer("frac_job_id").notNull(),
  date: text("date").notNull(),
  shift: text("shift").notNull().default("both"),
  category: text("category").notNull(),
  subCategory: text("sub_category"),
  hoursLost: real("hours_lost"),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lanesRelations = relations(lanes, ({ many }) => ({
  fracJobs: many(fracJobs),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  parent: one(scenarios, { fields: [scenarios.parentScenarioId], references: [scenarios.id] }),
  fracSchedules: many(scenarioFracSchedules),
  allocations: many(allocationBlocks),
}));

export const fracJobsRelations = relations(fracJobs, ({ one, many }) => ({
  lane: one(lanes, { fields: [fracJobs.laneId], references: [lanes.id] }),
  schedules: many(scenarioFracSchedules),
  allocations: many(allocationBlocks),
}));

export const scenarioFracSchedulesRelations = relations(scenarioFracSchedules, ({ one }) => ({
  scenario: one(scenarios, { fields: [scenarioFracSchedules.scenarioId], references: [scenarios.id] }),
  fracJob: one(fracJobs, { fields: [scenarioFracSchedules.fracJobId], references: [fracJobs.id] }),
}));

export const haulersRelations = relations(haulers, ({ many }) => ({
  capacityExceptions: many(haulerCapacityExceptions),
  allocations: many(allocationBlocks),
}));

export const haulerCapacityExceptionsRelations = relations(haulerCapacityExceptions, ({ one }) => ({
  hauler: one(haulers, { fields: [haulerCapacityExceptions.haulerId], references: [haulers.id] }),
}));

export const allocationBlocksRelations = relations(allocationBlocks, ({ one }) => ({
  scenario: one(scenarios, { fields: [allocationBlocks.scenarioId], references: [scenarios.id] }),
  fracJob: one(fracJobs, { fields: [allocationBlocks.fracJobId], references: [fracJobs.id] }),
  hauler: one(haulers, { fields: [allocationBlocks.haulerId], references: [haulers.id] }),
}));

export const fracDailyEventsRelations = relations(fracDailyEvents, ({ one }) => ({
  scenario: one(scenarios, { fields: [fracDailyEvents.scenarioId], references: [scenarios.id] }),
  fracJob: one(fracJobs, { fields: [fracDailyEvents.fracJobId], references: [fracJobs.id] }),
}));

// --- Sand actuals (Slice 1) ---------------------------------------------------

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull().default("sand_tickets"),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at").defaultNow(),
    endedAt: timestamp("ended_at"),
    rowsRead: integer("rows_read").notNull().default(0),
    rowsWritten: integer("rows_written").notNull().default(0),
    rowsUpdated: integer("rows_updated").notNull().default(0),
    rowsSkipped: integer("rows_skipped").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at"),
    requestPayload: jsonb("request_payload"),
    errorMessage: text("error_message"),
    triggeredByUserId: varchar("triggered_by_user_id"),
  },
  (t) => ({
    sourceIdx: index("sync_runs_source_idx").on(t.source),
    statusIdx: index("sync_runs_status_idx").on(t.status),
  }),
);

export const ingestedTickets = pgTable(
  "ingested_tickets",
  {
    id: serial("id").primaryKey(),

    commodity: text("commodity").notNull().default("sand"),

    sourceTicketNumber: text("source_ticket_number").notNull(),
    sourceDispatchNumber: text("source_dispatch_number"),
    ticketIdRaw: text("ticket_id_raw"),

    ticketStatus: text("ticket_status"),
    material: text("material"),
    loadType: text("load_type"),

    operator: text("operator"),
    hauler: text("hauler"),
    driverName: text("driver_name"),
    driverFirstName: text("driver_first_name"),
    driverLastName: text("driver_last_name"),
    truckNumber: text("truck_number"),
    trailerNumber: text("trailer_number"),

    sourceName: text("source_name"),
    sourceExternalId: text("source_external_id"),
    sourceLocationType: text("source_location_type"),

    destinationName: text("destination_name"),
    destinationExternalId: text("destination_external_id"),
    destinationLocationType: text("destination_location_type"),

    sourceVolume: numeric("source_volume", { precision: 14, scale: 2 }),
    destinationVolume: numeric("destination_volume", { precision: 14, scale: 2 }),
    volumeUnitOfMeasure: text("volume_unit_of_measure"),

    haulingRate: numeric("hauling_rate", { precision: 14, scale: 4 }),
    costType: text("cost_type"),
    haulingCost: numeric("hauling_cost", { precision: 14, scale: 2 }),
    totalNptCost: numeric("total_npt_cost", { precision: 14, scale: 2 }),
    totalTicketCost: numeric("total_ticket_cost", { precision: 14, scale: 2 }),

    durationHours: numeric("duration_hours", { precision: 10, scale: 2 }),
    billableTimeHours: numeric("billable_time_hours", { precision: 10, scale: 2 }),
    nptBillableHours: numeric("npt_billable_hours", { precision: 10, scale: 2 }),
    totalBillableTime: numeric("total_billable_time", { precision: 10, scale: 2 }),

    gpsTicketStartedAt: timestamp("gps_ticket_started_at"),
    gpsPickupCompletedAt: timestamp("gps_pickup_completed_at"),
    gpsDropoffCompletedAt: timestamp("gps_dropoff_completed_at"),

    haulerServiceStartAt: timestamp("hauler_service_start_at"),
    haulerServiceEndAt: timestamp("hauler_service_end_at"),
    haulerPickupCompletedAt: timestamp("hauler_pickup_completed_at"),
    haulerDropoffCompletedAt: timestamp("hauler_dropoff_completed_at"),

    failedAuditReason: text("failed_audit_reason"),
    driverComments: text("driver_comments"),
    adminComments: text("admin_comments"),

    rerouted: boolean("rerouted").default(false),
    flagged: boolean("flagged").default(false),

    normalizedHauler: text("normalized_hauler"),
    normalizedTruckNumber: text("normalized_truck_number"),
    normalizedDriverName: text("normalized_driver_name"),

    upstreamDevRunUid: text("upstream_dev_run_uid"),
    upstreamDevRunName: text("upstream_dev_run_name"),
    siteUid: text("site_uid"),
    siteName: text("site_name"),
    resourceSpread: text("resource_spread"),
    waterSystem: text("water_system"),

    rawPayload: jsonb("raw_payload"),
    syncedAt: timestamp("synced_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
  },
  (t) => ({
    ticketUnique: uniqueIndex("ingested_tickets_ticket_unique").on(t.sourceTicketNumber),
    commodityIdx: index("ingested_tickets_commodity_idx").on(t.commodity),
    statusIdx: index("ingested_tickets_status_idx").on(t.ticketStatus),
    destinationExternalIdIdx: index("ingested_tickets_destination_external_id_idx").on(
      t.destinationExternalId,
    ),
    gpsDropoffIdx: index("ingested_tickets_gps_dropoff_idx").on(t.gpsDropoffCompletedAt),
    haulerServiceEndIdx: index("ingested_tickets_hauler_service_end_idx").on(t.haulerServiceEndAt),
  }),
);

export const ticketAttributions = pgTable(
  "ticket_attributions",
  {
    id: serial("id").primaryKey(),
    ingestedTicketId: integer("ingested_ticket_id").notNull(),
    syncRunId: integer("sync_run_id"),

    attributionMethod: text("attribution_method").notNull(),
    attributionStatus: text("attribution_status").notNull().default("attributed"),
    exclusionReason: text("exclusion_reason"),

    precedenceFieldUsed: text("precedence_field_used"),

    effectiveEventAtLocal: timestamp("effective_event_at_local").notNull(),
    effectiveEventAtUtc: timestamp("effective_event_at_utc").notNull(),

    calendarReportDate: date("calendar_report_date").notNull(),
    operationalDayDate: date("operational_day_date").notNull(),

    dayPart: text("day_part"),
    hourLocal: integer("hour_local"),

    devRunUid: text("dev_run_uid"),
    devRunName: text("dev_run_name"),
    fracJobId: integer("frac_job_id"),

    siteUid: text("site_uid"),
    siteName: text("site_name"),
    resourceSpread: text("resource_spread"),
    waterSystem: text("water_system"),

    attributionConfidence: numeric("attribution_confidence", { precision: 5, scale: 2 }).default(
      "1.00",
    ),
    activePadSnapshotLoadedAt: timestamp("active_pad_snapshot_loaded_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    ticketIdx: index("ticket_attributions_ticket_idx").on(t.ingestedTicketId),
    devRunDateIdx: index("ticket_attributions_dev_run_date_idx").on(
      t.devRunUid,
      t.calendarReportDate,
    ),
    operationalDateIdx: index("ticket_attributions_operational_date_idx").on(t.operationalDayDate),
  }),
);

export const factFracDayActuals = pgTable(
  "fact_frac_day_actuals",
  {
    id: serial("id").primaryKey(),
    syncRunId: integer("sync_run_id"),

    devRunUid: text("dev_run_uid").notNull(),
    devRunName: text("dev_run_name").notNull(),
    fracJobId: integer("frac_job_id"),

    siteUid: text("site_uid"),
    siteName: text("site_name"),
    resourceSpread: text("resource_spread"),
    waterSystem: text("water_system"),

    calendarReportDate: date("calendar_report_date").notNull(),
    operationalDayDate: date("operational_day_date").notNull(),

    deliveredLoadCount: integer("delivered_load_count").notNull().default(0),
    deliveredTons: numeric("delivered_tons", { precision: 14, scale: 2 }).notNull().default("0"),
    deliveredTotalCost: numeric("delivered_total_cost", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),

    avgFieldCycleHours: numeric("avg_field_cycle_hours", { precision: 10, scale: 2 }),
    avgTicketCycleHours: numeric("avg_ticket_cycle_hours", { precision: 10, scale: 2 }),

    participatingTruckCount: integer("participating_truck_count").notNull().default(0),
    activeDriverCount: integer("active_driver_count").notNull().default(0),

    dayLoadCount: integer("day_load_count").notNull().default(0),
    nightLoadCount: integer("night_load_count").notNull().default(0),

    coreTruckCount2Plus: integer("core_truck_count_2plus").notNull().default(0),
    coreTruckCount3Plus: integer("core_truck_count_3plus").notNull().default(0),

    stageCountActual: integer("stage_count_actual"),
    pumpTimeHours: numeric("pump_time_hours", { precision: 10, scale: 2 }),
    opsNptHours: numeric("ops_npt_hours", { precision: 10, scale: 2 }),
    totalProppantLbActual: numeric("total_proppant_lb_actual", { precision: 14, scale: 2 }),
    dailyReqTons: numeric("daily_req_tons", { precision: 14, scale: 2 }),
    tonDelta: numeric("ton_delta", { precision: 14, scale: 2 }),

    totalNptHours: numeric("total_npt_hours", { precision: 10, scale: 2 }),
    sandNptHours: numeric("sand_npt_hours", { precision: 10, scale: 2 }),
    waterNptHours: numeric("water_npt_hours", { precision: 10, scale: 2 }),
    weatherNptHours: numeric("weather_npt_hours", { precision: 10, scale: 2 }),
    pumpNptHours: numeric("pump_npt_hours", { precision: 10, scale: 2 }),

    nptD1Cat: text("npt_d1_cat"),
    nptD1Reason: text("npt_d1_reason"),
    nptD1Hours: numeric("npt_d1_hours", { precision: 10, scale: 2 }),

    nptD2Cat: text("npt_d2_cat"),
    nptD2Reason: text("npt_d2_reason"),
    nptD2Hours: numeric("npt_d2_hours", { precision: 10, scale: 2 }),

    tonsPerStage: numeric("tons_per_stage", { precision: 14, scale: 2 }),
    costPerStage: numeric("cost_per_stage", { precision: 14, scale: 2 }),
    costPerTon: numeric("cost_per_ton", { precision: 14, scale: 2 }),

    attributionMethod: text("attribution_method").notNull(),
    refreshedAt: timestamp("refreshed_at").defaultNow(),
  },
  (t) => ({
    uniqueGrain: uniqueIndex("fact_frac_day_actuals_unique_grain").on(
      t.devRunUid,
      t.calendarReportDate,
      t.operationalDayDate,
      t.attributionMethod,
    ),
    calendarDateIdx: index("fact_frac_day_actuals_calendar_date_idx").on(t.calendarReportDate),
    operationalDateIdx: index("fact_frac_day_actuals_operational_date_idx").on(t.operationalDayDate),
  }),
);

export const ticketAttributionsRelations = relations(ticketAttributions, ({ one }) => ({
  ingestedTicket: one(ingestedTickets, {
    fields: [ticketAttributions.ingestedTicketId],
    references: [ingestedTickets.id],
  }),
  syncRun: one(syncRuns, {
    fields: [ticketAttributions.syncRunId],
    references: [syncRuns.id],
  }),
  fracJob: one(fracJobs, {
    fields: [ticketAttributions.fracJobId],
    references: [fracJobs.id],
  }),
}));

export const factFracDayActualsRelations = relations(factFracDayActuals, ({ one }) => ({
  syncRun: one(syncRuns, {
    fields: [factFracDayActuals.syncRunId],
    references: [syncRuns.id],
  }),
  fracJob: one(fracJobs, {
    fields: [factFracDayActuals.fracJobId],
    references: [fracJobs.id],
  }),
}));

export function getEffectiveTrucksForDate(
  schedule: { requiredTrucksPerShift: number; truckRequirementOverrides: string | null },
  dateStr: string
): number {
  if (!schedule.truckRequirementOverrides) return schedule.requiredTrucksPerShift;
  let overrides: Record<string, number>;
  try {
    overrides = JSON.parse(schedule.truckRequirementOverrides);
  } catch {
    return schedule.requiredTrucksPerShift;
  }
  const sortedDates = Object.keys(overrides).sort();
  let effectiveValue = schedule.requiredTrucksPerShift;
  for (const d of sortedDates) {
    if (d <= dateStr) {
      effectiveValue = overrides[d];
    } else {
      break;
    }
  }
  return effectiveValue;
}

export const insertLaneSchema = createInsertSchema(lanes).omit({ id: true });
export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFracJobSchema = createInsertSchema(fracJobs).omit({ id: true, createdAt: true });
export const insertScenarioFracScheduleSchema = createInsertSchema(scenarioFracSchedules).omit({ id: true });
export const insertHaulerSchema = createInsertSchema(haulers).omit({ id: true }).extend({
  isActive: z.boolean().optional(),
});
export const insertHaulerCapacityExceptionSchema = createInsertSchema(haulerCapacityExceptions).omit({ id: true });
export const insertAllocationBlockSchema = createInsertSchema(allocationBlocks).omit({ id: true }).extend({
  shift: z.enum(["day", "night", "both"]).default("both"),
});
export const insertPresetSchema = createInsertSchema(presets).omit({ id: true, createdAt: true });
export const insertFracDailyEventSchema = createInsertSchema(fracDailyEvents).omit({ id: true, createdAt: true });

export const insertSyncRunSchema = createInsertSchema(syncRuns).omit({ id: true });
export const insertIngestedTicketSchema = createInsertSchema(ingestedTickets).omit({
  id: true,
  syncedAt: true,
  lastSeenAt: true,
});
export const insertTicketAttributionSchema = createInsertSchema(ticketAttributions).omit({
  id: true,
  createdAt: true,
});
export const insertFactFracDayActualSchema = createInsertSchema(factFracDayActuals).omit({
  id: true,
  refreshedAt: true,
});

export type Lane = typeof lanes.$inferSelect;
export type InsertLane = z.infer<typeof insertLaneSchema>;
export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type FracJob = typeof fracJobs.$inferSelect;
export type InsertFracJob = z.infer<typeof insertFracJobSchema>;
export type ScenarioFracSchedule = typeof scenarioFracSchedules.$inferSelect;
export type InsertScenarioFracSchedule = z.infer<typeof insertScenarioFracScheduleSchema>;
export type Hauler = typeof haulers.$inferSelect;
export type InsertHauler = z.infer<typeof insertHaulerSchema>;
export type HaulerCapacityException = typeof haulerCapacityExceptions.$inferSelect;
export type InsertHaulerCapacityException = z.infer<typeof insertHaulerCapacityExceptionSchema>;
export type AllocationBlock = typeof allocationBlocks.$inferSelect;
export type InsertAllocationBlock = z.infer<typeof insertAllocationBlockSchema>;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;
export type FracDailyEvent = typeof fracDailyEvents.$inferSelect;
export type InsertFracDailyEvent = z.infer<typeof insertFracDailyEventSchema>;

export type SyncRun = typeof syncRuns.$inferSelect;
export type InsertSyncRun = z.infer<typeof insertSyncRunSchema>;
export type IngestedTicket = typeof ingestedTickets.$inferSelect;
export type InsertIngestedTicket = z.infer<typeof insertIngestedTicketSchema>;
export type TicketAttribution = typeof ticketAttributions.$inferSelect;
export type InsertTicketAttribution = z.infer<typeof insertTicketAttributionSchema>;
export type FactFracDayActual = typeof factFracDayActuals.$inferSelect;
export type InsertFactFracDayActual = z.infer<typeof insertFactFracDayActualSchema>;
