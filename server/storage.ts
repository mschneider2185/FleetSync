import {
  lanes, scenarios, fracJobs, scenarioFracSchedules,
  haulers, haulerCapacityExceptions, allocationBlocks,
  presets, fracDailyEvents,
  type Lane, type InsertLane,
  type Scenario, type InsertScenario,
  type FracJob, type InsertFracJob,
  type ScenarioFracSchedule, type InsertScenarioFracSchedule,
  type Hauler, type InsertHauler,
  type HaulerCapacityException, type InsertHaulerCapacityException,
  type AllocationBlock, type InsertAllocationBlock,
  type Preset, type InsertPreset,
  type FracDailyEvent, type InsertFracDailyEvent,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lte, gte, ne } from "drizzle-orm";

export interface IStorage {
  getLanes(): Promise<Lane[]>;
  getLane(id: number): Promise<Lane | undefined>;
  createLane(lane: InsertLane): Promise<Lane>;
  updateLane(id: number, lane: Partial<InsertLane>): Promise<Lane | undefined>;
  deleteLane(id: number): Promise<void>;

  getScenarios(): Promise<Scenario[]>;
  getScenario(id: number): Promise<Scenario | undefined>;
  createScenario(scenario: InsertScenario): Promise<Scenario>;
  updateScenario(id: number, scenario: Partial<InsertScenario>): Promise<Scenario | undefined>;
  deleteScenario(id: number): Promise<void>;

  getFracJobs(): Promise<FracJob[]>;
  getFracJob(id: number): Promise<FracJob | undefined>;
  createFracJob(job: InsertFracJob): Promise<FracJob>;
  updateFracJob(id: number, job: Partial<InsertFracJob>): Promise<FracJob | undefined>;
  deleteFracJob(id: number): Promise<void>;
  removeFracFromScenario(scenarioId: number, fracJobId: number): Promise<void>;

  getSchedulesByScenario(scenarioId: number): Promise<ScenarioFracSchedule[]>;
  getSchedule(id: number): Promise<ScenarioFracSchedule | undefined>;
  createSchedule(schedule: InsertScenarioFracSchedule): Promise<ScenarioFracSchedule>;
  updateSchedule(id: number, schedule: Partial<InsertScenarioFracSchedule>): Promise<ScenarioFracSchedule | undefined>;
  deleteSchedule(id: number): Promise<void>;
  deleteSchedulesByScenario(scenarioId: number): Promise<void>;

  getHaulers(): Promise<Hauler[]>;
  getHauler(id: number): Promise<Hauler | undefined>;
  createHauler(hauler: InsertHauler): Promise<Hauler>;
  updateHauler(id: number, hauler: Partial<InsertHauler>): Promise<Hauler | undefined>;
  deleteHauler(id: number): Promise<void>;

  getCapacityExceptions(haulerId: number): Promise<HaulerCapacityException[]>;
  createCapacityException(exception: InsertHaulerCapacityException): Promise<HaulerCapacityException>;
  deleteCapacityException(id: number): Promise<void>;

  getAllocationsByScenario(scenarioId: number): Promise<AllocationBlock[]>;
  getAllocation(id: number): Promise<AllocationBlock | undefined>;
  findOverlappingAllocations(scenarioId: number, fracJobId: number, haulerId: number, startDate: string, endDate: string, excludeId?: number): Promise<AllocationBlock[]>;
  createAllocation(allocation: InsertAllocationBlock): Promise<AllocationBlock>;
  updateAllocation(id: number, allocation: Partial<InsertAllocationBlock>): Promise<AllocationBlock | undefined>;
  deleteAllocation(id: number): Promise<void>;
  deleteAllocationsByScenario(scenarioId: number): Promise<void>;

  getPresets(): Promise<Preset[]>;
  getPresetsByType(type: string): Promise<Preset[]>;
  createPreset(preset: InsertPreset): Promise<Preset>;
  deletePreset(id: number): Promise<void>;

  getEventsByFracAndScenario(fracJobId: number, scenarioId: number): Promise<FracDailyEvent[]>;
  getEventsByScenario(scenarioId: number): Promise<FracDailyEvent[]>;
  getEvent(id: number): Promise<FracDailyEvent | undefined>;
  createEvent(event: InsertFracDailyEvent): Promise<FracDailyEvent>;
  updateEvent(id: number, event: Partial<InsertFracDailyEvent>): Promise<FracDailyEvent | undefined>;
  deleteEvent(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getLanes(): Promise<Lane[]> {
    return db.select().from(lanes).orderBy(lanes.sortOrder);
  }
  async getLane(id: number): Promise<Lane | undefined> {
    const [lane] = await db.select().from(lanes).where(eq(lanes.id, id));
    return lane;
  }
  async createLane(lane: InsertLane): Promise<Lane> {
    const [created] = await db.insert(lanes).values(lane).returning();
    return created;
  }
  async updateLane(id: number, lane: Partial<InsertLane>): Promise<Lane | undefined> {
    const [updated] = await db.update(lanes).set(lane).where(eq(lanes.id, id)).returning();
    return updated;
  }
  async deleteLane(id: number): Promise<void> {
    await db.delete(lanes).where(eq(lanes.id, id));
  }

  async getScenarios(): Promise<Scenario[]> {
    return db.select().from(scenarios);
  }
  async getScenario(id: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return scenario;
  }
  async createScenario(scenario: InsertScenario): Promise<Scenario> {
    const [created] = await db.insert(scenarios).values(scenario).returning();
    return created;
  }
  async updateScenario(id: number, scenario: Partial<InsertScenario>): Promise<Scenario | undefined> {
    const [updated] = await db.update(scenarios).set({ ...scenario, updatedAt: new Date() }).where(eq(scenarios.id, id)).returning();
    return updated;
  }
  async deleteScenario(id: number): Promise<void> {
    await db.delete(allocationBlocks).where(eq(allocationBlocks.scenarioId, id));
    await db.delete(fracDailyEvents).where(eq(fracDailyEvents.scenarioId, id));
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.scenarioId, id));
    await db.delete(scenarios).where(eq(scenarios.id, id));
  }

  async getFracJobs(): Promise<FracJob[]> {
    return db.select().from(fracJobs);
  }
  async getFracJob(id: number): Promise<FracJob | undefined> {
    const [job] = await db.select().from(fracJobs).where(eq(fracJobs.id, id));
    return job;
  }
  async createFracJob(job: InsertFracJob): Promise<FracJob> {
    const [created] = await db.insert(fracJobs).values(job).returning();
    return created;
  }
  async updateFracJob(id: number, job: Partial<InsertFracJob>): Promise<FracJob | undefined> {
    const [updated] = await db.update(fracJobs).set(job).where(eq(fracJobs.id, id)).returning();
    return updated;
  }
  async deleteFracJob(id: number): Promise<void> {
    await db.delete(allocationBlocks).where(eq(allocationBlocks.fracJobId, id));
    await db.delete(fracDailyEvents).where(eq(fracDailyEvents.fracJobId, id));
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.fracJobId, id));
    await db.delete(fracJobs).where(eq(fracJobs.id, id));
  }

  async removeFracFromScenario(scenarioId: number, fracJobId: number): Promise<void> {
    await db.delete(allocationBlocks).where(
      and(eq(allocationBlocks.scenarioId, scenarioId), eq(allocationBlocks.fracJobId, fracJobId))
    );
    await db.delete(fracDailyEvents).where(
      and(eq(fracDailyEvents.scenarioId, scenarioId), eq(fracDailyEvents.fracJobId, fracJobId))
    );
    await db.delete(scenarioFracSchedules).where(
      and(eq(scenarioFracSchedules.scenarioId, scenarioId), eq(scenarioFracSchedules.fracJobId, fracJobId))
    );
  }

  async getSchedulesByScenario(scenarioId: number): Promise<ScenarioFracSchedule[]> {
    return db.select().from(scenarioFracSchedules).where(eq(scenarioFracSchedules.scenarioId, scenarioId));
  }
  async getSchedule(id: number): Promise<ScenarioFracSchedule | undefined> {
    const [schedule] = await db.select().from(scenarioFracSchedules).where(eq(scenarioFracSchedules.id, id));
    return schedule;
  }
  async createSchedule(schedule: InsertScenarioFracSchedule): Promise<ScenarioFracSchedule> {
    const [created] = await db.insert(scenarioFracSchedules).values(schedule).returning();
    return created;
  }
  async updateSchedule(id: number, schedule: Partial<InsertScenarioFracSchedule>): Promise<ScenarioFracSchedule | undefined> {
    const [updated] = await db.update(scenarioFracSchedules).set(schedule).where(eq(scenarioFracSchedules.id, id)).returning();
    return updated;
  }
  async deleteSchedule(id: number): Promise<void> {
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.id, id));
  }
  async deleteSchedulesByScenario(scenarioId: number): Promise<void> {
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.scenarioId, scenarioId));
  }

  async getHaulers(): Promise<Hauler[]> {
    return db.select().from(haulers);
  }
  async getHauler(id: number): Promise<Hauler | undefined> {
    const [hauler] = await db.select().from(haulers).where(eq(haulers.id, id));
    return hauler;
  }
  async createHauler(hauler: InsertHauler): Promise<Hauler> {
    const [created] = await db.insert(haulers).values(hauler).returning();
    return created;
  }
  async updateHauler(id: number, hauler: Partial<InsertHauler>): Promise<Hauler | undefined> {
    const [updated] = await db.update(haulers).set(hauler).where(eq(haulers.id, id)).returning();
    return updated;
  }
  async deleteHauler(id: number): Promise<void> {
    await db.delete(allocationBlocks).where(eq(allocationBlocks.haulerId, id));
    await db.delete(haulerCapacityExceptions).where(eq(haulerCapacityExceptions.haulerId, id));
    await db.delete(haulers).where(eq(haulers.id, id));
  }

  async getCapacityExceptions(haulerId: number): Promise<HaulerCapacityException[]> {
    return db.select().from(haulerCapacityExceptions).where(eq(haulerCapacityExceptions.haulerId, haulerId));
  }
  async createCapacityException(exception: InsertHaulerCapacityException): Promise<HaulerCapacityException> {
    const [created] = await db.insert(haulerCapacityExceptions).values(exception).returning();
    return created;
  }
  async deleteCapacityException(id: number): Promise<void> {
    await db.delete(haulerCapacityExceptions).where(eq(haulerCapacityExceptions.id, id));
  }

  async getAllocationsByScenario(scenarioId: number): Promise<AllocationBlock[]> {
    return db.select().from(allocationBlocks).where(eq(allocationBlocks.scenarioId, scenarioId));
  }
  async getAllocation(id: number): Promise<AllocationBlock | undefined> {
    const [allocation] = await db.select().from(allocationBlocks).where(eq(allocationBlocks.id, id));
    return allocation;
  }
  async findOverlappingAllocations(scenarioId: number, fracJobId: number, haulerId: number, startDate: string, endDate: string, excludeId?: number): Promise<AllocationBlock[]> {
    let conditions = [
      eq(allocationBlocks.scenarioId, scenarioId),
      eq(allocationBlocks.fracJobId, fracJobId),
      eq(allocationBlocks.haulerId, haulerId),
      lte(allocationBlocks.startDate, endDate),
      gte(allocationBlocks.endDate, startDate),
    ];
    if (excludeId) {
      conditions.push(ne(allocationBlocks.id, excludeId));
    }
    return db.select().from(allocationBlocks).where(and(...conditions));
  }
  async createAllocation(allocation: InsertAllocationBlock): Promise<AllocationBlock> {
    const [created] = await db.insert(allocationBlocks).values(allocation).returning();
    return created;
  }
  async updateAllocation(id: number, allocation: Partial<InsertAllocationBlock>): Promise<AllocationBlock | undefined> {
    const [updated] = await db.update(allocationBlocks).set(allocation).where(eq(allocationBlocks.id, id)).returning();
    return updated;
  }
  async deleteAllocation(id: number): Promise<void> {
    await db.delete(allocationBlocks).where(eq(allocationBlocks.id, id));
  }
  async deleteAllocationsByScenario(scenarioId: number): Promise<void> {
    await db.delete(allocationBlocks).where(eq(allocationBlocks.scenarioId, scenarioId));
  }

  async getPresets(): Promise<Preset[]> {
    return db.select().from(presets);
  }
  async getPresetsByType(type: string): Promise<Preset[]> {
    return db.select().from(presets).where(eq(presets.presetType, type));
  }
  async createPreset(preset: InsertPreset): Promise<Preset> {
    const [created] = await db.insert(presets).values(preset).returning();
    return created;
  }
  async deletePreset(id: number): Promise<void> {
    await db.delete(presets).where(eq(presets.id, id));
  }

  async getEventsByFracAndScenario(fracJobId: number, scenarioId: number): Promise<FracDailyEvent[]> {
    return db.select().from(fracDailyEvents).where(
      and(eq(fracDailyEvents.fracJobId, fracJobId), eq(fracDailyEvents.scenarioId, scenarioId))
    );
  }
  async getEventsByScenario(scenarioId: number): Promise<FracDailyEvent[]> {
    return db.select().from(fracDailyEvents).where(eq(fracDailyEvents.scenarioId, scenarioId));
  }
  async getEvent(id: number): Promise<FracDailyEvent | undefined> {
    const [event] = await db.select().from(fracDailyEvents).where(eq(fracDailyEvents.id, id));
    return event;
  }
  async createEvent(event: InsertFracDailyEvent): Promise<FracDailyEvent> {
    const [created] = await db.insert(fracDailyEvents).values(event).returning();
    return created;
  }
  async updateEvent(id: number, event: Partial<InsertFracDailyEvent>): Promise<FracDailyEvent | undefined> {
    const [updated] = await db.update(fracDailyEvents).set(event).where(eq(fracDailyEvents.id, id)).returning();
    return updated;
  }
  async deleteEvent(id: number): Promise<void> {
    await db.delete(fracDailyEvents).where(eq(fracDailyEvents.id, id));
  }
}

export const storage = new DatabaseStorage();
