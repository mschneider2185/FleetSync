import type { IStorage } from "../storage";
import type { NormalizedSandplanRow } from "./sandplan-csv";
import { runLaneCascadeAfterEndDateExtend } from "./cascade";
import type { InsertFracJob, InsertScenarioFracSchedule } from "@shared/schema";

const DEFAULT_LANE_NAME = "Unassigned";
const BASELINE_SCENARIO_NAMES = ["Baseline", "Baseline Plan", "Baseline Q1 2026"];
const BASELINE_SCENARIO_TYPES = ["baseline"];

export interface ImportSummary {
  rows: number;
  createdFracs: number;
  updatedFracs: number;
  createdSchedules: number;
  updatedSchedules: number;
  skippedRows: number;
  warnings: string[];
}

export interface ResolveScenarioResult {
  scenarioId: number;
  created: boolean;
}

/**
 * Resolve scenario for import: by scenarioId, or find/create Baseline.
 */
export async function resolveImportScenario(
  storage: IStorage,
  scenarioIdParam: number | undefined
): Promise<ResolveScenarioResult> {
  if (scenarioIdParam != null && !Number.isNaN(scenarioIdParam)) {
    const scenario = await storage.getScenario(scenarioIdParam);
    if (!scenario) throw new Error("Scenario not found");
    return { scenarioId: scenario.id, created: false };
  }

  const scenarios = await storage.getScenarios();
  const baseline =
    scenarios.find((s) => BASELINE_SCENARIO_TYPES.includes(s.type)) ??
    scenarios.find((s) => BASELINE_SCENARIO_NAMES.includes(s.name));
  if (baseline) return { scenarioId: baseline.id, created: false };

  const created = await storage.createScenario({
    name: "Baseline Plan",
    type: "baseline",
    locked: false,
  });
  return { scenarioId: created.id, created: true };
}

function pick<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[]
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v as T[keyof T];
  }
  return out;
}

/**
 * Resolve or create lane by name. Returns lane id.
 */
async function resolveLaneId(storage: IStorage, laneName: string | undefined): Promise<number> {
  const name = laneName?.trim() || DEFAULT_LANE_NAME;
  const lane = await storage.getLaneByName(name);
  if (lane) return lane.id;
  const lanes = await storage.getLanes();
  const maxSort = lanes.length === 0 ? 0 : Math.max(...lanes.map((l) => l.sortOrder));
  const created = await storage.createLane({
    name,
    color: "#3b82f6",
    sortOrder: maxSort + 1,
  });
  return created.id;
}

export async function runSandplanImport(
  storage: IStorage,
  scenarioId: number,
  rows: NormalizedSandplanRow[]
): Promise<{ summary: ImportSummary }> {
  const summary: ImportSummary = {
    rows: rows.length,
    createdFracs: 0,
    updatedFracs: 0,
    createdSchedules: 0,
    updatedSchedules: 0,
    skippedRows: 0,
    warnings: [],
  };

  let fracJobs = await storage.getFracJobs();
  let schedules = await storage.getSchedulesByScenario(scenarioId);

  for (const row of rows) {
    if (!row.padName?.trim()) {
      summary.skippedRows++;
      summary.warnings.push(`Row skipped: missing padName.`);
      continue;
    }

    const resolvedLaneId = await resolveLaneId(storage, row.laneName);

    let frac =
      fracJobs.find((f) => f.padName === row.padName && f.laneId === resolvedLaneId) ??
      fracJobs.find((f) => f.padName === row.padName);

    const fracPayload: InsertFracJob = {
      padName: row.padName.trim(),
      laneId: resolvedLaneId,
      ...pick(row as Record<string, unknown>, [
        "customer",
        "basin",
        "notes",
        "stagesPerDay",
        "tonsPerStage",
        "totalStages",
        "travelTimeHours",
        "avgTonsPerLoad",
        "loadUnloadTimeHours",
        "storageType",
        "storageCapacity",
      ]) as Partial<InsertFracJob>,
    };

    if (frac) {
      const updatePayload = pick(fracPayload as Record<string, unknown>, [
        "laneId",
        "customer",
        "basin",
        "notes",
        "stagesPerDay",
        "tonsPerStage",
        "totalStages",
        "travelTimeHours",
        "avgTonsPerLoad",
        "loadUnloadTimeHours",
        "storageType",
        "storageCapacity",
      ]) as Partial<InsertFracJob>;
      if (Object.keys(updatePayload).length > 0) {
        await storage.updateFracJob(frac.id, updatePayload);
      }
      summary.updatedFracs++;
    } else {
      frac = await storage.createFracJob(fracPayload);
      fracJobs = [...fracJobs, frac];
      summary.createdFracs++;
    }

    const hasStart = row.plannedStartDate != null && row.plannedStartDate !== "";
    const hasEnd = row.plannedEndDate != null && row.plannedEndDate !== "";
    const canSetSchedule = hasStart && hasEnd;

    const existingSchedule = schedules.find((s) => s.fracJobId === frac!.id);

    if (canSetSchedule) {
      const plannedStartDate = row.plannedStartDate!;
      const plannedEndDate = row.plannedEndDate!;
      const requiredTrucksPerShift =
        row.requiredTrucksPerShift ?? existingSchedule?.requiredTrucksPerShift ?? 0;
      const transitionDaysAfter =
        row.transitionDaysAfter ?? existingSchedule?.transitionDaysAfter ?? 0;

      if (existingSchedule) {
        const oldEnd = existingSchedule.plannedEndDate;
        const update: Partial<InsertScenarioFracSchedule> = {
          plannedStartDate,
          plannedEndDate,
          transitionDaysAfter,
          requiredTrucksPerShift,
        };
        await storage.updateSchedule(existingSchedule.id, update);
        summary.updatedSchedules++;

        if (plannedEndDate > oldEnd) {
          await runLaneCascadeAfterEndDateExtend(
            storage,
            scenarioId,
            existingSchedule.id,
            { fracJobId: frac.id, plannedStartDate: existingSchedule.plannedStartDate },
            plannedEndDate,
            transitionDaysAfter
          );
          schedules = await storage.getSchedulesByScenario(scenarioId);
        }
      } else {
        const created = await storage.createSchedule({
          scenarioId,
          fracJobId: frac.id,
          plannedStartDate,
          plannedEndDate,
          transitionDaysAfter,
          requiredTrucksPerShift,
          status: "planned",
        });
        summary.createdSchedules++;
        schedules = [...schedules, created];
      }
    } else if (!existingSchedule && (hasStart || hasEnd)) {
      if (row.stagesPerDay === 0 || (row.stagesPerDay == null && !hasEnd)) {
        summary.warnings.push(
          `Pad "${row.padName}": skipped schedule update (missing or zero stagesPerDay and no end date).`
        );
      }
    }
  }

  return { summary };
}
