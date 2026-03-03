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

    try {
      const result = await db.transaction(async (tx) => {
        const [newScenario] = await tx.insert(scenariosTable).values({
          name: sandboxName,
          type: "sandbox",
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
            }))
          );
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
  app.delete("/api/frac-jobs/:id", isAuthenticated, async (req, res) => {
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

      const cascadedSchedules: Array<{ id: number; plannedStartDate: string; plannedEndDate: string }> = [];

      if (validated.plannedEndDate && validated.plannedEndDate > oldSchedule.plannedEndDate) {
        const frac = await storage.getFracJob(oldSchedule.fracJobId);
        if (frac) {
          const allSchedules = await storage.getSchedulesByScenario(oldSchedule.scenarioId);
          const allFracJobs = await storage.getFracJobs();
          const fracMap = new Map(allFracJobs.map(f => [f.id, f]));

          const laneSchedules = allSchedules
            .filter(s => {
              const f = fracMap.get(s.fracJobId);
              return f && f.laneId === frac.laneId && s.id !== scheduleId;
            })
            .sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate));

          let prevEnd = validated.plannedEndDate;
          let prevTransition = data.transitionDaysAfter || 0;

          for (const downstream of laneSchedules) {
            if (downstream.plannedStartDate <= oldSchedule.plannedStartDate) continue;

            const prevEndDate = new Date(prevEnd);
            prevEndDate.setDate(prevEndDate.getDate() + prevTransition);
            const earliestStart = prevEndDate.toISOString().split("T")[0];

            if (downstream.plannedStartDate > earliestStart) break;

            const dStart = new Date(downstream.plannedStartDate);
            const dEnd = new Date(downstream.plannedEndDate);
            const durationMs = dEnd.getTime() - dStart.getTime();

            const newStartDate = new Date(prevEnd);
            newStartDate.setDate(newStartDate.getDate() + prevTransition + 1);
            const newStart = newStartDate.toISOString().split("T")[0];
            const newEndDate = new Date(newStartDate.getTime() + durationMs);
            const newEnd = newEndDate.toISOString().split("T")[0];

            await storage.updateSchedule(downstream.id, {
              plannedStartDate: newStart,
              plannedEndDate: newEnd,
            });

            cascadedSchedules.push({ id: downstream.id, plannedStartDate: newStart, plannedEndDate: newEnd });

            prevEnd = newEnd;
            prevTransition = downstream.transitionDaysAfter || 0;
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
  app.post("/api/allocations", isAuthenticated, async (req: any, res) => {
    try {
      const validated = validateBody(insertAllocationBlockSchema, req.body);
      if (!(await checkScenarioEditable(req, res, validated.scenarioId))) return;
      const overlapping = await storage.findOverlappingAllocations(
        validated.scenarioId, validated.fracJobId, validated.haulerId,
        validated.startDate, validated.endDate
      );
      if (overlapping.length > 0) {
        return res.status(409).json({ message: "An allocation already exists for this hauler and frac job on the specified dates" });
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
      const validated = insertAllocationBlockSchema.partial().parse(req.body);
      const existing = await storage.getAllocation(allocId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!(await checkScenarioEditable(req, res, existing.scenarioId))) return;
      if (validated.startDate || validated.endDate) {
        const overlapping = await storage.findOverlappingAllocations(
          validated.scenarioId ?? existing.scenarioId,
          validated.fracJobId ?? existing.fracJobId,
          validated.haulerId ?? existing.haulerId,
          validated.startDate ?? existing.startDate,
          validated.endDate ?? existing.endDate,
          allocId
        );
        if (overlapping.length > 0) {
          return res.status(409).json({ message: "This change would overlap with an existing allocation" });
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

  app.get("/api/scenarios/:scenarioId/conflicts", isAuthenticated, async (req, res) => {
    const scenarioId = Number(req.params.scenarioId);
    if (isNaN(scenarioId)) return res.status(400).json({ message: "Invalid scenario ID" });

    const [schedules, allocations, allHaulers] = await Promise.all([
      storage.getSchedulesByScenario(scenarioId),
      storage.getAllocationsByScenario(scenarioId),
      storage.getHaulers(),
    ]);

    const conflicts: Array<{
      type: "hauler_over_capacity" | "frac_under_supplied" | "frac_over_supplied" | "hauler_split_warning";
      date: string;
      entityId: number;
      entityName: string;
      detail: string;
    }> = [];

    const allDates = new Set<string>();
    schedules.forEach(s => {
      let d = new Date(s.plannedStartDate);
      const end = new Date(s.plannedEndDate);
      while (d <= end) {
        allDates.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    });

    const fracJobs = await storage.getFracJobs();
    const fracMap = new Map(fracJobs.map(f => [f.id, f]));
    const haulerMap = new Map(allHaulers.map(h => [h.id, h]));

    for (const dateStr of allDates) {
      const haulerAssignments = new Map<number, { total: number; fracs: number[] }>();
      const fracAssignments = new Map<number, number>();

      for (const alloc of allocations) {
        if (alloc.startDate <= dateStr && alloc.endDate >= dateStr) {
          const ha = haulerAssignments.get(alloc.haulerId) || { total: 0, fracs: [] };
          ha.total += alloc.trucksPerShift;
          if (!ha.fracs.includes(alloc.fracJobId)) ha.fracs.push(alloc.fracJobId);
          haulerAssignments.set(alloc.haulerId, ha);

          const fa = (fracAssignments.get(alloc.fracJobId) || 0) + alloc.trucksPerShift;
          fracAssignments.set(alloc.fracJobId, fa);
        }
      }

      for (const [haulerId, assignment] of haulerAssignments) {
        const hauler = haulerMap.get(haulerId);
        if (!hauler) continue;
        const maxCap = hauler.defaultMaxTrucksPerShift;

        if (assignment.total > maxCap) {
          conflicts.push({
            type: "hauler_over_capacity",
            date: dateStr,
            entityId: haulerId,
            entityName: hauler.name,
            detail: `Assigned ${assignment.total} trucks, max capacity ${maxCap}`,
          });
        }

        if (!hauler.splitAllowed && assignment.fracs.length > 1) {
          conflicts.push({
            type: "hauler_split_warning",
            date: dateStr,
            entityId: haulerId,
            entityName: hauler.name,
            detail: `Assigned to ${assignment.fracs.length} fracs but split not allowed`,
          });
        }
      }

      for (const schedule of schedules) {
        if (schedule.plannedStartDate <= dateStr && schedule.plannedEndDate >= dateStr) {
          const frac = fracMap.get(schedule.fracJobId);
          if (!frac) continue;
          const assigned = fracAssignments.get(schedule.fracJobId) || 0;
          const required = getEffectiveTrucksForDate(schedule, dateStr);
          const name = frac.padName || frac.wellName || `Frac #${schedule.fracJobId}`;

          if (assigned < required) {
            conflicts.push({
              type: "frac_under_supplied",
              date: dateStr,
              entityId: schedule.fracJobId,
              entityName: name,
              detail: `Assigned ${assigned} trucks, needs ${required} (short ${required - assigned})`,
            });
          } else if (assigned > required && required > 0) {
            conflicts.push({
              type: "frac_over_supplied",
              date: dateStr,
              entityId: schedule.fracJobId,
              entityName: name,
              detail: `Assigned ${assigned} trucks, only needs ${required} (over by ${assigned - required})`,
            });
          }
        }
      }
    }

    res.json(conflicts);
  });

  return httpServer;
}
