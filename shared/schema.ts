import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial, real } from "drizzle-orm/pg-core";
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
export const insertHaulerSchema = createInsertSchema(haulers).omit({ id: true });
export const insertHaulerCapacityExceptionSchema = createInsertSchema(haulerCapacityExceptions).omit({ id: true });
export const insertAllocationBlockSchema = createInsertSchema(allocationBlocks).omit({ id: true }).extend({
  shift: z.enum(["day", "night", "both"]).default("both"),
});
export const insertPresetSchema = createInsertSchema(presets).omit({ id: true, createdAt: true });
export const insertFracDailyEventSchema = createInsertSchema(fracDailyEvents).omit({ id: true, createdAt: true });

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
