import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import {
  scenarios as scenariosTable, scenarioFracSchedules, allocationBlocks, fracJobs,
} from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { seedDatabase } from "./seed";
import {
  insertLaneSchema, insertScenarioSchema, insertFracJobSchema,
  insertScenarioFracScheduleSchema, insertHaulerSchema,
  insertHaulerCapacityExceptionSchema, insertAllocationBlockSchema,
  insertPresetSchema, insertFracDailyEventSchema,
  getEffectiveTrucksForDate,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import multer from "multer";

import { runLaneCascadeAfterEndDateExtend } from "./import/cascade";
import { parseSandplanCsv } from "./import/sandplan-csv";
import { resolveImportScenario, runSandplanImport } from "./import/run-import";

function toShift(s: string | null | undefined): "day" | "night" | "both" {
  if (s === "day" || s === "night" || s === "both") return s;
  return "both";
}

const upload = multer({ storage: multer.memoryStorage() });

function validateBody(schema: any, body: any) {
  return schema.parse(body);
}

const PLANNER_USERNAMES = (process.env.PLANNER_USERNAMES || "").split(",").map(s => s.trim()).filter(Boolean);

function isPlanner(req: any): boolean {
  if (PLANNER_USERNAMES.length === 0) return true;
  const username = req.user?.claims?.preferred_username || req.user?.claims?.name || "";
  return PLANNER_USERNAMES.includes(username);
}

function canEditScenario(req: any, scenario: { type: string; locked: boolean; createdByUserId: string | null }): boolean {
  if (isPlanner(req)) return true;
  if (scenario.type === "sandbox") {
    const userId = req.user?.claims?.sub;
    return scenario.createdByUserId === userId;
  }
  return false;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  await seedDatabase();

  app.get("/api/lanes", isAuthenticated, async (_req, res) => {
    const data = await storage.getLanes();
    res.json(data);
  });
  app.post("/api/lanes", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertLaneSchema, req.body);
      const data = await storage.createLane(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/lanes/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertLaneSchema.partial().parse(req.body);
      const data = await storage.updateLane(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/lanes/:id", isAuthenticated, async (req, res) => {
    await storage.deleteLane(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/scenarios", isAuthenticated, async (_req, res) => {
    const data = await storage.getScenarios();
    res.json(data);
  });
  app.post("/api/scenarios", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertScenarioSchema, req.body);
      const data = await storage.createScenario(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  async function checkScenarioEditable(req: any, res: any, scenarioId: number): Promise<boolean> {
    const scenario = await storage.getScenario(scenarioId);
    if (!scenario) { res.status(404).json({ message: "Scenario not found" }); return false; }
    if (!canEditScenario(req, scenario)) { res.status(403).json({ message: "You do not have permission to edit this scenario" }); return false; }
    return true;
  }

  app.patch("/api/scenarios/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!(await checkScenarioEditable(req, res, id))) return;
      const validated = insertScenarioSchema.partial().parse(req.body);
      const data = await storage.updateScenario(id, validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/scenarios/:id", isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    if (!(await checkScenarioEditable(req, res, id))) return;
    await storage.deleteScenario(id);
    res.json({ ok: true });
  });
  app.post("/api/scenarios/:id/clone", isAuthenticated, async (req: any, res) => {
    if (!isPlanner(req)) return res.status(403).json({ message: "Only planners can clone scenarios" });
    const sourceId = Number(req.params.id);
    const source = await storage.getScenario(sourceId);
    if (!source) return res.status(404).json({ message: "Not found" });

    try {
      const result = await db.transaction(async (tx) => {
        const [newScenario] = await tx.insert(scenariosTable).values({
          name: req.body.name || `${source.name} (Copy)`,
          type: req.body.type || "sandbox",
          parentScenarioId: sourceId,
          locked: false,
          createdByUserId: req.user?.claims?.sub || null,
        }).returning();

        const schedules = await storage.getSchedulesByScenario(sourceId);
        if (schedules.length > 0) {
          await tx.insert(scenarioFracSchedules).values(
            schedules.map(s => ({
              scenarioId: newScenario.id,
              fracJobId: s.fracJobId,
              plannedStartDate: s.plannedStartDate,
              plannedEndDate: s.plannedEndDate,
              transitionDaysAfter: s.transitionDaysAfter,
              requiredTrucksPerShift: s.requiredTrucksPerShift,
              status: s.status,
            }))
          );
        }

        const allocations = await storage.getAllocationsByScenario(sourceId);
        if (allocations.length > 0) {
          await tx.insert(allocationBlocks).values(
            allocations.map(a => ({
              scenarioId: newScenario.id,
              fracJobId: a.fracJobId,
              haulerId: a.haulerId,
              startDate: a.startDate,
              endDate: a.endDate,
              trucksPerShift: a.trucksPerShift,
              shift: a.shift ?? "both",
            }))
          );
        }

        return newScenario;
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Clone failed" });
    }
  });

  app.post("/api/scenarios/:id/create-sandbox", isAuthenticated, async (req: any, res) => {
    const sourceId = Number(req.params.id);
    const source = await storage.getScenario(sourceId);
    if (!source) return res.status(404).json({ message: "Not found" });

    const username = req.user?.claims?.preferred_username || req.user?.claims?.name || "User";
    const dateStr = new Date().toISOString().split("T")[0];
    const sandboxName = req.body.name || `Sandbox - ${username} - ${dateStr}`;
    const blank = req.body.blank === true;

    try {
      const result = await db.transaction(async (tx) => {
        const [newScenario] = await tx.insert(scenariosTable).values({
          name: sandboxName,
          type: "sandbox",
          parentScenarioId: sourceId,
          locked: false,
          createdByUserId: req.user?.claims?.sub || null,
        }).returning();

        if (!blank) {
          const schedules = await storage.getSchedulesByScenario(sourceId);
          if (schedules.length > 0) {
            await tx.insert(scenarioFracSchedules).values(
              schedules.map(s => ({
                scenarioId: newScenario.id,
                fracJobId: s.fracJobId,
                plannedStartDate: s.plannedStartDate,
                plannedEndDate: s.plannedEndDate,
                transitionDaysAfter: s.transitionDaysAfter,
                requiredTrucksPerShift: s.requiredTrucksPerShift,
                status: s.status,
              }))
            );
          }

          const allocations = await storage.getAllocationsByScenario(sourceId);
          if (allocations.length > 0) {
            await tx.insert(allocationBlocks).values(
              allocations.map(a => ({
                scenarioId: newScenario.id,
                fracJobId: a.fracJobId,
                haulerId: a.haulerId,
                startDate: a.startDate,
                endDate: a.endDate,
                trucksPerShift: a.trucksPerShift,
                shift: a.shift ?? "both",
              }))
            );
          }
        }

        return newScenario;
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Sandbox creation failed" });
    }
  });

  app.get("/api/auth/role", isAuthenticated, async (req: any, res) => {
    res.json({ isPlanner: isPlanner(req) });
  });

  app.get("/api/frac-jobs", isAuthenticated, async (_req, res) => {
    const data = await storage.getFracJobs();
    res.json(data);
  });
  app.get("/api/frac-jobs/:id", isAuthenticated, async (req, res) => {
    const data = await storage.getFracJob(Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Not found" });
    res.json(data);
  });
  app.post("/api/frac-jobs", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertFracJobSchema, req.body);
      const data = await storage.createFracJob(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/frac-jobs/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertFracJobSchema.partial().parse(req.body);
      const data = await storage.updateFracJob(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/frac-jobs/:id", isAuthenticated, async (req: any, res) => {
    const scenarioId = req.query.scenarioId ? Number(req.query.scenarioId) : null;

    if (scenarioId) {
      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) return res.status(404).json({ message: "Scenario not found" });
      if (!canEditScenario(req, scenario)) return res.status(403).json({ message: "Permission denied" });

      if (scenario.type === "sandbox") {
        await storage.removeFracFromScenario(scenarioId, Number(req.params.id));
        return res.json({ ok: true });
      }
    }

    if (!isPlanner(req)) return res.status(403).json({ message: "Only planners can permanently delete frac jobs" });
    await storage.deleteFracJob(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/scenarios/:scenarioId/schedules", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });
    const data = await storage.getSchedulesByScenario(scenarioId);
    res.json(data);
  });
  app.post("/api/schedules", isAuthenticated, async (req: any, res) => {
    try {
      const validated = validateBody(insertScenarioFracScheduleSchema, req.body);
      if (!(await checkScenarioEditable(req, res, validated.scenarioId))) return;
      const data = await storage.createSchedule(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/schedules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = Number(req.params.id);
      const validated = insertScenarioFracScheduleSchema.partial().parse(req.body);

      const oldSchedule = await storage.getSchedule(scheduleId);
      if (!oldSchedule) return res.status(404).json({ message: "Not found" });
      if (!(await checkScenarioEditable(req, res, oldSchedule.scenarioId))) return;

      const data = await storage.updateSchedule(scheduleId, validated);
      if (!data) return res.status(404).json({ message: "Not found" });

      let cascadedSchedules: Array<{ id: number; fracJobId: number; oldPlannedStartDate: string; newPlannedStartDate: string; plannedStartDate: string; plannedEndDate: string }> = [];
      if (validated.plannedEndDate && validated.plannedEndDate > oldSchedule.plannedEndDate) {
        cascadedSchedules = await runLaneCascadeAfterEndDateExtend(
          storage,
          oldSchedule.scenarioId,
          scheduleId,
          { fracJobId: oldSchedule.fracJobId, plannedStartDate: oldSchedule.plannedStartDate },
          validated.plannedEndDate,
          data.transitionDaysAfter ?? 0
        );
        for (const cascaded of cascadedSchedules) {
          const oldStart = new Date(cascaded.oldPlannedStartDate);
          const newStart = new Date(cascaded.newPlannedStartDate);
          const daysDelta = Math.round((newStart.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDelta !== 0) {
            await storage.shiftAllocationsForFracJob(oldSchedule.scenarioId, cascaded.fracJobId, daysDelta);
          }
        }
      }

      res.json({ ...data, cascadedSchedules });
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/schedules/:id", isAuthenticated, async (req: any, res) => {
    const schedule = await storage.getSchedule(Number(req.params.id));
    if (!schedule) return res.status(404).json({ message: "Not found" });
    if (!(await checkScenarioEditable(req, res, schedule.scenarioId))) return;
    await storage.deleteSchedule(schedule.id);
    res.json({ ok: true });
  });

  app.post("/api/import/sandplan/preview", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) return res.status(400).json({ message: "No file uploaded; use field name 'file'" });
      const { rows, warnings, detectedMappings } = parseSandplanCsv(file.buffer);
      return res.json({ ok: true, normalizedRows: rows, detectedMappings, warnings });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(400).json({ message });
    }
  });

  app.post("/api/import/sandplan", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) return res.status(400).json({ message: "No file uploaded; use field name 'file'" });
      const scenarioIdParam = req.query.scenarioId != null ? Number(req.query.scenarioId) : undefined;

      const { scenarioId, created } = await resolveImportScenario(storage, scenarioIdParam);
      if (!(await checkScenarioEditable(req, res, scenarioId))) return;

      const { rows, warnings: parseWarnings } = parseSandplanCsv(file.buffer);
      const { summary } = await runSandplanImport(storage, scenarioId, rows);
      const warnings = [...parseWarnings, ...summary.warnings];

      return res.json({
        ok: true,
        scenarioId,
        summary: {
          ...summary,
          warnings,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "Scenario not found") return res.status(404).json({ message });
      return res.status(400).json({ message });
    }
  });

  app.get("/api/haulers", isAuthenticated, async (_req, res) => {
    const data = await storage.getHaulers();
    res.json(data);
  });
  app.post("/api/haulers", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertHaulerSchema, req.body);
      const data = await storage.createHauler(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/haulers/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertHaulerSchema.partial().parse(req.body);
      const data = await storage.updateHauler(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/haulers/:id", isAuthenticated, async (req, res) => {
    await storage.deleteHauler(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/haulers/:id/capacity-exceptions", isAuthenticated, async (req, res) => {
    const data = await storage.getCapacityExceptions(Number(req.params.id));
    res.json(data);
  });
  app.post("/api/capacity-exceptions", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertHaulerCapacityExceptionSchema, req.body);
      const data = await storage.createCapacityException(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/capacity-exceptions/:id", isAuthenticated, async (req, res) => {
    await storage.deleteCapacityException(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/scenarios/:scenarioId/allocations", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });
    const data = await storage.getAllocationsByScenario(scenarioId);
    res.json(data);
  });
  async function checkHaulerCapacity(
    scenarioId: number, haulerId: number, trucksPerShift: number,
    startDate: string, endDate: string, excludeAllocId?: number, shift?: string
  ): Promise<string | null> {
    const hauler = await storage.getHauler(haulerId);
    if (!hauler) return null;
    const maxCap = hauler.defaultMaxTrucksPerShift;
    const exceptions = await storage.getCapacityExceptions(haulerId);
    const allAllocations = await storage.getAllocationsByScenario(scenarioId);
    const schedules = await storage.getSchedulesByScenario(scenarioId);
    const completedFracJobIds = new Set(
      schedules.filter(s => s.status === "complete").map(s => s.fracJobId)
    );
    const activeAllocations = allAllocations.filter(a => !completedFracJobIds.has(a.fracJobId));

    const effectiveShift = toShift(shift);

    let d = new Date(startDate);
    const end = new Date(endDate);
    while (d <= end) {
      const ds = d.toISOString().split("T")[0];
      const exception = exceptions.find(e => e.date === ds);
      const cap = exception ? (exception.maxTrucksPerShift ?? maxCap) : maxCap;
      if (cap == null) { d.setDate(d.getDate() + 1); continue; }

      const shiftsToCheck: ("day" | "night")[] = effectiveShift === "both" ? ["day", "night"] : [effectiveShift];

      for (const checkShift of shiftsToCheck) {
        let channelTotal = trucksPerShift;
        for (const a of activeAllocations) {
          if (a.haulerId !== haulerId) continue;
          if (excludeAllocId && a.id === excludeAllocId) continue;
          if (a.startDate <= ds && a.endDate >= ds) {
            const aShift = toShift(a.shift);
            if (aShift === checkShift || aShift === "both") {
              channelTotal += a.trucksPerShift;
            }
          }
        }
        if (channelTotal > cap) {
          const shiftLabel = effectiveShift === "both" ? `${checkShift} shift on` : `on`;
          return `${hauler.name} would have ${channelTotal} trucks assigned ${shiftLabel} ${ds} but max capacity is ${cap}`;
        }
      }

      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  app.post("/api/allocations", isAuthenticated, async (req: any, res) => {
    try {
      const force = req.body.force === true;
      const { force: _f, ...body } = req.body;
      const validated = validateBody(insertAllocationBlockSchema, body);
      if (!(await checkScenarioEditable(req, res, validated.scenarioId))) return;
      const overlapping = await storage.findOverlappingAllocations(
        validated.scenarioId, validated.fracJobId, validated.haulerId,
        validated.startDate, validated.endDate, undefined, validated.shift ?? "both"
      );
      if (overlapping.length > 0) {
        return res.status(409).json({ message: "An allocation already exists for this hauler and frac job on the specified dates" });
      }
      if (!force) {
        const capacityWarning = await checkHaulerCapacity(
          validated.scenarioId, validated.haulerId, validated.trucksPerShift,
          validated.startDate, validated.endDate, undefined, validated.shift ?? "both"
        );
        if (capacityWarning) {
          return res.status(422).json({ message: capacityWarning, requiresConfirmation: true });
        }
      }
      const data = await storage.createAllocation(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/allocations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const allocId = Number(req.params.id);
      const force = req.body.force === true;
      const { force: _f, ...body } = req.body;
      const validated = insertAllocationBlockSchema.partial().parse(body);
      const existing = await storage.getAllocation(allocId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!(await checkScenarioEditable(req, res, existing.scenarioId))) return;
      const effectiveShift = validated.shift ?? existing.shift ?? "both";
      const overlapFieldChanged = !!(
        validated.startDate || validated.endDate ||
        validated.shift || validated.haulerId || validated.fracJobId || validated.scenarioId
      );
      if (overlapFieldChanged) {
        const overlapping = await storage.findOverlappingAllocations(
          validated.scenarioId ?? existing.scenarioId,
          validated.fracJobId ?? existing.fracJobId,
          validated.haulerId ?? existing.haulerId,
          validated.startDate ?? existing.startDate,
          validated.endDate ?? existing.endDate,
          allocId,
          effectiveShift
        );
        if (overlapping.length > 0) {
          return res.status(409).json({ message: "This change would overlap with an existing allocation" });
        }
      }
      if (!force) {
        const capacityWarning = await checkHaulerCapacity(
          validated.scenarioId ?? existing.scenarioId,
          validated.haulerId ?? existing.haulerId,
          validated.trucksPerShift ?? existing.trucksPerShift,
          validated.startDate ?? existing.startDate,
          validated.endDate ?? existing.endDate,
          allocId,
          effectiveShift
        );
        if (capacityWarning) {
          return res.status(422).json({ message: capacityWarning, requiresConfirmation: true });
        }
      }
      const data = await storage.updateAllocation(allocId, validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.post("/api/allocations/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const force = req.body.force === true;
      const setZero = req.body.setZero === true;
      const { force: _f, setZero: _z, ...body } = req.body;
      const validated = validateBody(insertAllocationBlockSchema, body);
      if (!(await checkScenarioEditable(req, res, validated.scenarioId))) return;

      const targetShift = validated.shift ?? "both";

      const overlapping = await storage.findOverlappingAllocations(
        validated.scenarioId, validated.fracJobId, validated.haulerId,
        validated.startDate, validated.endDate, undefined, targetShift
      );

      for (const o of overlapping) {
        const oShift = toShift(o.shift);
        await storage.deleteAllocation(o.id);

        if (o.startDate < validated.startDate) {
          const prevDay = new Date(validated.startDate + "T00:00:00");
          prevDay.setDate(prevDay.getDate() - 1);
          await storage.createAllocation({
            scenarioId: o.scenarioId, fracJobId: o.fracJobId, haulerId: o.haulerId,
            startDate: o.startDate, endDate: prevDay.toISOString().split("T")[0],
            trucksPerShift: o.trucksPerShift, shift: oShift,
          });
        }

        if (o.endDate > validated.endDate) {
          const nextDay = new Date(validated.endDate + "T00:00:00");
          nextDay.setDate(nextDay.getDate() + 1);
          await storage.createAllocation({
            scenarioId: o.scenarioId, fracJobId: o.fracJobId, haulerId: o.haulerId,
            startDate: nextDay.toISOString().split("T")[0], endDate: o.endDate,
            trucksPerShift: o.trucksPerShift, shift: oShift,
          });
        }

        if (oShift === "both" && targetShift !== "both") {
          const otherShift: "day" | "night" = targetShift === "day" ? "night" : "day";
          const overlapStart = o.startDate > validated.startDate ? o.startDate : validated.startDate;
          const overlapEnd = o.endDate < validated.endDate ? o.endDate : validated.endDate;
          await storage.createAllocation({
            scenarioId: o.scenarioId, fracJobId: o.fracJobId, haulerId: o.haulerId,
            startDate: overlapStart, endDate: overlapEnd,
            trucksPerShift: o.trucksPerShift, shift: otherShift,
          });
        }
      }

      if (validated.trucksPerShift > 0 || setZero) {
        if (!force && validated.trucksPerShift > 0) {
          const capacityWarning = await checkHaulerCapacity(
            validated.scenarioId, validated.haulerId, validated.trucksPerShift,
            validated.startDate, validated.endDate, undefined, targetShift
          );
          if (capacityWarning) {
            return res.status(422).json({ message: capacityWarning, requiresConfirmation: true });
          }
        }
        const data = await storage.createAllocation(validated);
        return res.json(data);
      }

      res.json({ ok: true, deleted: overlapping.length });
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });

  app.delete("/api/allocations/:id", isAuthenticated, async (req: any, res) => {
    const alloc = await storage.getAllocation(Number(req.params.id));
    if (!alloc) return res.status(404).json({ message: "Not found" });
    if (!(await checkScenarioEditable(req, res, alloc.scenarioId))) return;
    await storage.deleteAllocation(alloc.id);
    res.json({ ok: true });
  });

  app.get("/api/presets", isAuthenticated, async (req, res) => {
    const type = req.query.type as string | undefined;
    if (type) {
      const data = await storage.getPresetsByType(type);
      return res.json(data);
    }
    const data = await storage.getPresets();
    res.json(data);
  });
  app.post("/api/presets", isAuthenticated, async (req: any, res) => {
    if (!isPlanner(req)) return res.status(403).json({ message: "Only planners can create presets" });
    try {
      const validated = validateBody(insertPresetSchema, req.body);
      const data = await storage.createPreset(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/presets/:id", isAuthenticated, async (req: any, res) => {
    if (!isPlanner(req)) return res.status(403).json({ message: "Only planners can delete presets" });
    res.json({ ok: true });
    await storage.deletePreset(Number(req.params.id));
  });

  app.get("/api/scenarios/:scenarioId/events", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });
    const data = await storage.getEventsByScenario(scenarioId);
    res.json(data);
  });

  app.get("/api/frac-jobs/:id/events", isAuthenticated, async (req, res) => {
    const fracJobId = Number(req.params.id);
    const scenarioId = Number(req.query.scenarioId);
    if (isNaN(fracJobId) || isNaN(scenarioId)) return res.status(400).json({ message: "Invalid parameters" });
    const data = await storage.getEventsByFracAndScenario(fracJobId, scenarioId);
    res.json(data);
  });
  app.post("/api/frac-jobs/:id/events", isAuthenticated, async (req: any, res) => {
    try {
      const fracJobId = Number(req.params.id);
      const scenarioId = Number(req.body.scenarioId);
      if (!(await checkScenarioEditable(req, res, scenarioId))) return;
      const validated = validateBody(insertFracDailyEventSchema, {
        ...req.body,
        fracJobId,
        createdByUserId: req.user?.claims?.sub || null,
      });
      const data = await storage.createEvent(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getEvent(Number(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      if (!(await checkScenarioEditable(req, res, event.scenarioId))) return;
      const validated = insertFracDailyEventSchema.partial().parse(req.body);
      const data = await storage.updateEvent(event.id, validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/events/:id", isAuthenticated, async (req: any, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Not found" });
    if (!(await checkScenarioEditable(req, res, event.scenarioId))) return;
    await storage.deleteEvent(event.id);
    res.json({ ok: true });
  });

  app.get("/api/scenarios/:scenarioId/export", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });

    const [allSchedules, allAllocations, allHaulers, allFracJobs, allLanes, scenario] = await Promise.all([
      storage.getSchedulesByScenario(scenarioId),
      storage.getAllocationsByScenario(scenarioId),
      storage.getHaulers(),
      storage.getFracJobs(),
      storage.getLanes(),
      storage.getScenario(scenarioId),
    ]);

    const fracMap = new Map(allFracJobs.map(f => [f.id, f]));
    const haulerMap = new Map(allHaulers.map(h => [h.id, h]));
    const laneMap = new Map(allLanes.map(l => [l.id, l]));

    const exportDate = new Date().toISOString().split("T")[0];
    const scenarioName = scenario?.name || "Unknown";

    const allDates = new Set<string>();
    allSchedules.forEach(s => {
      let d = new Date(s.plannedStartDate);
      const end = new Date(s.plannedEndDate);
      while (d <= end) {
        allDates.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    });
    const sortedDates = Array.from(allDates).sort();

    const escape = (val: string | number) => {
      const s = String(val);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const filename = `FleetSync_${scenarioName.replace(/[^a-zA-Z0-9]/g, "_")}_${exportDate}.csv`;

    if (sortedDates.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(`Scenario:,${escape(scenarioName)}\nExport Date:,${exportDate}\n\nLane,Frac,Hauler\n`);
    }

    const rows: string[] = [];
    rows.push(`Scenario:,${escape(scenarioName)}`);
    rows.push(`Export Date:,${exportDate}`);
    rows.push("");
    rows.push(["Lane", "Frac", "Hauler", ...sortedDates].map(escape).join(","));

    let isFirstFrac = true;
    for (const schedule of allSchedules) {
      const frac = fracMap.get(schedule.fracJobId);
      if (!frac) continue;
      const lane = laneMap.get(frac.laneId);
      const fracAllocations = allAllocations.filter(a => a.fracJobId === schedule.fracJobId);
      const haulerIds = Array.from(new Set(fracAllocations.map(a => a.haulerId)));

      if (!isFirstFrac) {
        rows.push(Array(sortedDates.length + 3).fill("").join(","));
      }
      isFirstFrac = false;

      if (haulerIds.length === 0) {
        const values = sortedDates.map(ds =>
          ds >= schedule.plannedStartDate && ds <= schedule.plannedEndDate ? "0" : ""
        );
        rows.push([escape(lane?.name || ""), escape(frac.padName), "", ...values].join(","));
      } else {
        for (const hId of haulerIds) {
          const hauler = haulerMap.get(hId);
          const hAllocations = fracAllocations.filter(a => a.haulerId === hId);
          const values = sortedDates.map(ds => {
            if (ds < schedule.plannedStartDate || ds > schedule.plannedEndDate) return "";
            const alloc = hAllocations.find(a => a.startDate <= ds && a.endDate >= ds);
            return alloc ? String(alloc.trucksPerShift) : "0";
          });
          rows.push([escape(lane?.name || ""), escape(frac.padName), escape(hauler?.name || ""), ...values].join(","));
        }
      }
    }

    rows.push(Array(sortedDates.length + 3).fill("").join(","));

    const haulerTotalValues = sortedDates.map(ds => {
      const total = allAllocations
        .filter(a => a.startDate <= ds && a.endDate >= ds)
        .reduce((sum, a) => sum + a.trucksPerShift, 0);
      return total > 0 ? String(total) : "";
    });
    rows.push(["", escape("Hauler Totals"), "", ...haulerTotalValues].join(","));

    const fracNeedValues = sortedDates.map(ds => {
      const total = allSchedules
        .filter(s => s.plannedStartDate <= ds && s.plannedEndDate >= ds && (s.status === "active" || s.status === "planned" || s.status === "complete"))
        .reduce((sum, s) => sum + getEffectiveTrucksForDate(s, ds), 0);
      return total > 0 ? String(total) : "";
    });
    rows.push(["", escape("Frac Needs Total"), "", ...fracNeedValues].join(","));

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rows.join("\n"));
  });

  app.get("/api/frac-jobs/:id/report", isAuthenticated, async (req, res) => {
    const fracJobId = Number(req.params.id);
    const scenarioId = Number(req.query.scenarioId);
    if (isNaN(fracJobId) || isNaN(scenarioId)) return res.status(400).json({ message: "Invalid parameters" });

    const [fracJob, scenario, allSchedules, allAllocations, allHaulers, allLanes, events] = await Promise.all([
      storage.getFracJob(fracJobId),
      storage.getScenario(scenarioId),
      storage.getSchedulesByScenario(scenarioId),
      storage.getAllocationsByScenario(scenarioId),
      storage.getHaulers(),
      storage.getLanes(),
      storage.getEventsByFracAndScenario(fracJobId, scenarioId),
    ]);

    if (!fracJob) return res.status(404).json({ message: "Frac job not found" });

    const schedule = allSchedules.find(s => s.fracJobId === fracJobId);
    const lane = allLanes.find(l => l.id === fracJob.laneId);
    const haulerMap = new Map(allHaulers.map(h => [h.id, h]));
    const fracAllocations = allAllocations.filter(a => a.fracJobId === fracJobId);
    const exportDate = new Date().toISOString().split("T")[0];

    const escape = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows: string[] = [];

    rows.push(`Frac Report: ${escape(fracJob.padName)}`);
    rows.push(`Scenario:,${escape(scenario?.name || "Unknown")}`);
    rows.push(`Export Date:,${exportDate}`);
    rows.push("");

    rows.push("FRAC DETAILS");
    rows.push(`Pad Name:,${escape(fracJob.padName)}`);
    rows.push(`Customer:,${escape(fracJob.customer)}`);
    rows.push(`Basin:,${escape(fracJob.basin)}`);
    rows.push(`Lane:,${escape(lane?.name)}`);
    rows.push(`Stages/Day:,${fracJob.stagesPerDay ?? ""}`);
    rows.push(`Tons/Stage:,${fracJob.tonsPerStage ?? ""}`);
    rows.push(`Total Stages:,${fracJob.totalStages ?? ""}`);
    rows.push(`Travel Time (hrs):,${fracJob.travelTimeHours ?? ""}`);
    rows.push(`Avg Tons/Load:,${fracJob.avgTonsPerLoad ?? ""}`);
    rows.push(`Storage:,${fracJob.storageType ? `${fracJob.storageType} (${fracJob.storageCapacity}t)` : ""}`);
    if (fracJob.notes) rows.push(`Notes:,${escape(fracJob.notes)}`);
    rows.push("");

    if (schedule) {
      rows.push("SCHEDULE INFO");
      rows.push(`Start Date:,${schedule.plannedStartDate}`);
      rows.push(`End Date:,${schedule.plannedEndDate}`);
      rows.push(`Status:,${schedule.status}`);
      rows.push(`Required Trucks/Shift:,${schedule.requiredTrucksPerShift}`);
      rows.push(`Transition Days After:,${schedule.transitionDaysAfter}`);
      rows.push("");

      const dailyDates: string[] = [];
      let d = new Date(schedule.plannedStartDate);
      const end = new Date(schedule.plannedEndDate);
      while (d <= end) {
        dailyDates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }

      rows.push("DAILY TRUCK SUMMARY");
      rows.push("Date,Trucks Expected,Trucks Assigned,Delta");
      for (const ds of dailyDates) {
        const expected = getEffectiveTrucksForDate(schedule, ds);
        const assigned = fracAllocations
          .filter(a => a.startDate <= ds && a.endDate >= ds)
          .reduce((sum, a) => sum + a.trucksPerShift, 0);
        const delta = assigned - expected;
        rows.push(`${ds},${expected},${assigned},${delta}`);
      }
      rows.push("");
    }

    if (events.length > 0) {
      const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
      rows.push("NPT / EVENTS");
      rows.push("Date,Category,Hours Lost,Notes");
      for (const evt of sortedEvents) {
        rows.push([evt.date, escape(evt.category), evt.hoursLost ?? "", escape(evt.notes)].join(","));
      }
      rows.push("");
    }

    if (fracAllocations.length > 0) {
      rows.push("HAULER ASSIGNMENTS");
      rows.push("Hauler,Start Date,End Date,Trucks/Shift");
      const sortedAllocs = [...fracAllocations].sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (const alloc of sortedAllocs) {
        const hauler = haulerMap.get(alloc.haulerId);
        rows.push([escape(hauler?.name || `Hauler #${alloc.haulerId}`), alloc.startDate, alloc.endDate, alloc.trucksPerShift].join(","));
      }
    }

    const filename = `FleetSync_FracReport_${fracJob.padName.replace(/[^a-zA-Z0-9]/g, "_")}_${exportDate}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rows.join("\n"));
  });

  app.get("/api/scenarios/:scenarioId/conflicts", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });

    const [schedules, allocations, allHaulers, fracJobs] = await Promise.all([
      storage.getSchedulesByScenario(scenarioId),
      storage.getAllocationsByScenario(scenarioId),
      storage.getHaulers(),
      storage.getFracJobs(),
    ]);

    const completedFracJobIds = new Set(
      schedules.filter(s => s.status === "complete").map(s => s.fracJobId)
    );
    const activeAllocations = allocations.filter(a => !completedFracJobIds.has(a.fracJobId));

    const conflicts: Array<{
      type: "hauler_over_capacity" | "frac_under_supplied" | "frac_over_supplied" | "hauler_split_warning";
      date: string;
      entityId: number;
      entityName: string;
      detail: string;
    }> = [];

    const activeSchedules = schedules.filter(s => s.status !== "complete");

    const allDates = new Set<string>();
    activeSchedules.forEach(s => {
      let d = new Date(s.plannedStartDate);
      const end = new Date(s.plannedEndDate);
      while (d <= end) {
        allDates.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    });

    const fracMap = new Map(fracJobs.map(f => [f.id, f]));
    const haulerMap = new Map(allHaulers.map(h => [h.id, h]));

    const haulerExceptionsMap = new Map<number, Awaited<ReturnType<typeof storage.getCapacityExceptions>>>();
    const uniqueHaulerIds = new Set(activeAllocations.map(a => a.haulerId));
    await Promise.all(
      Array.from(uniqueHaulerIds).map(async (hId) => {
        const exceptions = await storage.getCapacityExceptions(hId);
        haulerExceptionsMap.set(hId, exceptions);
      })
    );

    const allDatesArray = Array.from(allDates);
    for (const dateStr of allDatesArray) {
      type ShiftKey = "day" | "night";
      const SHIFTS: ShiftKey[] = ["day", "night"];

      const haulerShiftAssignments = new Map<number, Record<ShiftKey, { total: number; fracs: number[]; fracTrucks: Map<number, number> }>>();
      const fracShiftAssignments = new Map<number, Record<ShiftKey, { total: number; haulerTrucks: Map<number, number> }>>();

      for (const alloc of activeAllocations) {
        if (alloc.startDate <= dateStr && alloc.endDate >= dateStr) {
          const allocShift = toShift(alloc.shift);
          const shiftsForAlloc: ShiftKey[] = allocShift === "both" ? ["day", "night"] : [allocShift];

          if (!haulerShiftAssignments.has(alloc.haulerId)) {
            haulerShiftAssignments.set(alloc.haulerId, {
              day: { total: 0, fracs: [], fracTrucks: new Map() },
              night: { total: 0, fracs: [], fracTrucks: new Map() },
            });
          }
          const haulerEntry = haulerShiftAssignments.get(alloc.haulerId)!;

          if (!fracShiftAssignments.has(alloc.fracJobId)) {
            fracShiftAssignments.set(alloc.fracJobId, {
              day: { total: 0, haulerTrucks: new Map() },
              night: { total: 0, haulerTrucks: new Map() },
            });
          }
          const fracEntry = fracShiftAssignments.get(alloc.fracJobId)!;

          for (const s of shiftsForAlloc) {
            const hsd = haulerEntry[s];
            hsd.total += alloc.trucksPerShift;
            if (!hsd.fracs.includes(alloc.fracJobId)) hsd.fracs.push(alloc.fracJobId);
            hsd.fracTrucks.set(alloc.fracJobId, (hsd.fracTrucks.get(alloc.fracJobId) || 0) + alloc.trucksPerShift);

            const fsd = fracEntry[s];
            fsd.total += alloc.trucksPerShift;
            fsd.haulerTrucks.set(alloc.haulerId, (fsd.haulerTrucks.get(alloc.haulerId) || 0) + alloc.trucksPerShift);
          }
        }
      }

      Array.from(haulerShiftAssignments.entries()).forEach(([haulerId, shiftData]) => {
        const hauler = haulerMap.get(haulerId);
        if (!hauler) return;
        const exceptions = haulerExceptionsMap.get(haulerId) || [];
        const exception = exceptions.find(e => e.date === dateStr);
        const maxCap = exception ? (exception.maxTrucksPerShift ?? hauler.defaultMaxTrucksPerShift) : hauler.defaultMaxTrucksPerShift;

        for (const s of SHIFTS) {
          const assignment = shiftData[s];
          if (assignment.total === 0) continue;

          if (assignment.total > maxCap) {
            const over = assignment.total - maxCap;
            const breakdown = assignment.fracs.map((fId: number) => {
              const frac = fracMap.get(fId);
              const trucks = assignment.fracTrucks.get(fId) || 0;
              return `${frac?.padName || `Frac #${fId}`}: ${trucks}`;
            }).join(", ");
            const capSource = exception ? `exception capacity ${maxCap}` : `max capacity ${maxCap}`;
            conflicts.push({
              type: "hauler_over_capacity",
              date: dateStr,
              entityId: haulerId,
              entityName: hauler.name,
              detail: `${s} shift: Assigned ${assignment.total} trucks but ${capSource} (${over} over) [${breakdown}]`,
            });
          }
        }

        const allFracs = new Set<number>();
        for (const s of SHIFTS) {
          shiftData[s].fracs.forEach(fId => allFracs.add(fId));
        }
        if (!hauler.splitAllowed && allFracs.size > 1) {
          const fracNames = Array.from(allFracs).map((fId: number) => {
            const frac = fracMap.get(fId);
            return frac?.padName || `Frac #${fId}`;
          }).join(", ");
          conflicts.push({
            type: "hauler_split_warning",
            date: dateStr,
            entityId: haulerId,
            entityName: hauler.name,
            detail: `Split across ${allFracs.size} fracs (${fracNames}) but split not allowed`,
          });
        }
      });

      for (const schedule of activeSchedules) {
        if (schedule.plannedStartDate <= dateStr && schedule.plannedEndDate >= dateStr) {
          const frac = fracMap.get(schedule.fracJobId);
          if (!frac) continue;
          const required = getEffectiveTrucksForDate(schedule, dateStr);
          const name = frac.padName || `Frac #${schedule.fracJobId}`;
          const fracData = fracShiftAssignments.get(schedule.fracJobId);

          for (const s of SHIFTS) {
            const shiftAssigned = fracData?.[s]?.total || 0;

            const haulerBreakdown = fracData?.[s]
              ? Array.from(fracData[s].haulerTrucks.entries()).map(([hId, trucks]: [number, number]) => {
                  const h = haulerMap.get(hId);
                  return `${h?.name || `Hauler #${hId}`}: ${trucks}`;
                }).join(", ")
              : "none assigned";

            if (shiftAssigned < required) {
              const short = required - shiftAssigned;
              conflicts.push({
                type: "frac_under_supplied",
                date: dateStr,
                entityId: schedule.fracJobId,
                entityName: name,
                detail: `${s} shift: Needs ${required} trucks but only ${shiftAssigned} assigned (${short} short) [${haulerBreakdown}]`,
              });
            } else if (shiftAssigned > required && required > 0) {
              const over = shiftAssigned - required;
              conflicts.push({
                type: "frac_over_supplied",
                date: dateStr,
                entityId: schedule.fracJobId,
                entityName: name,
                detail: `${s} shift: Needs ${required} trucks but ${shiftAssigned} assigned (${over} over) [${haulerBreakdown}]`,
              });
            }
          }
        }
      }
    }

    res.json(conflicts);
  });

  return httpServer;
}
