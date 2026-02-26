import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { seedDatabase } from "./seed";
import {
  insertLaneSchema, insertScenarioSchema, insertFracJobSchema,
  insertScenarioFracScheduleSchema, insertHaulerSchema,
  insertHaulerCapacityExceptionSchema, insertAllocationBlockSchema,
} from "@shared/schema";
import { ZodError } from "zod";

function validateBody(schema: any, body: any) {
  return schema.parse(body);
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
  app.patch("/api/scenarios/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertScenarioSchema.partial().parse(req.body);
      const data = await storage.updateScenario(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/scenarios/:id", isAuthenticated, async (req, res) => {
    await storage.deleteScenario(Number(req.params.id));
    res.json({ ok: true });
  });
  app.post("/api/scenarios/:id/clone", isAuthenticated, async (req, res) => {
    const sourceId = Number(req.params.id);
    const source = await storage.getScenario(sourceId);
    if (!source) return res.status(404).json({ message: "Not found" });

    const newScenario = await storage.createScenario({
      name: req.body.name || `${source.name} (Copy)`,
      type: req.body.type || "sandbox",
      parentScenarioId: sourceId,
      locked: false,
    });

    const schedules = await storage.getSchedulesByScenario(sourceId);
    for (const s of schedules) {
      await storage.createSchedule({
        scenarioId: newScenario.id,
        fracJobId: s.fracJobId,
        plannedStartDate: s.plannedStartDate,
        plannedEndDate: s.plannedEndDate,
        transitionDaysAfter: s.transitionDaysAfter,
        requiredTrucksPerShift: s.requiredTrucksPerShift,
        status: s.status,
      });
    }

    const allocations = await storage.getAllocationsByScenario(sourceId);
    for (const a of allocations) {
      await storage.createAllocation({
        scenarioId: newScenario.id,
        fracJobId: a.fracJobId,
        haulerId: a.haulerId,
        startDate: a.startDate,
        endDate: a.endDate,
        trucksPerShift: a.trucksPerShift,
      });
    }

    res.json(newScenario);
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
  app.post("/api/schedules", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertScenarioFracScheduleSchema, req.body);
      const data = await storage.createSchedule(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/schedules/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertScenarioFracScheduleSchema.partial().parse(req.body);
      const data = await storage.updateSchedule(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/schedules/:id", isAuthenticated, async (req, res) => {
    await storage.deleteSchedule(Number(req.params.id));
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
  app.post("/api/allocations", isAuthenticated, async (req, res) => {
    try {
      const validated = validateBody(insertAllocationBlockSchema, req.body);
      const data = await storage.createAllocation(validated);
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.patch("/api/allocations/:id", isAuthenticated, async (req, res) => {
    try {
      const validated = insertAllocationBlockSchema.partial().parse(req.body);
      const data = await storage.updateAllocation(Number(req.params.id), validated);
      if (!data) return res.status(404).json({ message: "Not found" });
      res.json(data);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors.map(err => `${err.path.length ? err.path.join('.') + ': ' : ''}${err.message}`).join('; ') });
      throw e;
    }
  });
  app.delete("/api/allocations/:id", isAuthenticated, async (req, res) => {
    await storage.deleteAllocation(Number(req.params.id));
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
      type: "hauler_over_capacity" | "frac_under_supplied" | "frac_zero_buffer" | "frac_over_supplied" | "hauler_split_warning";
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
          const assigned = fracAssignments.get(schedule.fracJobId) || 0;
          const required = schedule.requiredTrucksPerShift;
          const frac = fracMap.get(schedule.fracJobId);
          const name = frac?.padName || `Frac #${schedule.fracJobId}`;

          if (assigned < required) {
            conflicts.push({
              type: "frac_under_supplied",
              date: dateStr,
              entityId: schedule.fracJobId,
              entityName: name,
              detail: `Assigned ${assigned} trucks, needs ${required} (short ${required - assigned})`,
            });
          } else if (assigned === required && required > 0) {
            conflicts.push({
              type: "frac_zero_buffer",
              date: dateStr,
              entityId: schedule.fracJobId,
              entityName: name,
              detail: `Exactly at required (${required} trucks), no buffer`,
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
