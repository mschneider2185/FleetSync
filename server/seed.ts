import { db } from "./db";
import { lanes, scenarios, fracJobs, scenarioFracSchedules, haulers, allocationBlocks, presets, fracDailyEvents } from "@shared/schema";
import { eq } from "drizzle-orm";

async function cleanupOrphanedData() {
  const allFracIds = (await db.select({ id: fracJobs.id }).from(fracJobs)).map(f => f.id);
  if (allFracIds.length === 0) return;
  
  const allSchedules = await db.select().from(scenarioFracSchedules);
  const orphanedSchedules = allSchedules.filter(s => !allFracIds.includes(s.fracJobId));
  if (orphanedSchedules.length > 0) {
    for (const s of orphanedSchedules) {
      await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.id, s.id));
    }
    console.log(`Cleaned up ${orphanedSchedules.length} orphaned schedules`);
  }

  const allAllocations = await db.select().from(allocationBlocks);
  const orphanedAllocations = allAllocations.filter(a => !allFracIds.includes(a.fracJobId));
  if (orphanedAllocations.length > 0) {
    for (const a of orphanedAllocations) {
      await db.delete(allocationBlocks).where(eq(allocationBlocks.id, a.id));
    }
    console.log(`Cleaned up ${orphanedAllocations.length} orphaned allocations`);
  }
}

async function seedPresets() {
  const existingPresets = await db.select().from(presets);
  if (existingPresets.length === 0) {
    await db.insert(presets).values([
      {
        presetType: "storage",
        name: "Kube Job",
        description: "Standard kube setup with 2500 ton starting capacity",
        data: JSON.stringify({ storageType: "kube", storageCapacity: 2500 }),
        isSystem: true,
      },
      {
        presetType: "storage",
        name: "Silo Job",
        description: "Standard silo setup with 500 ton starting capacity",
        data: JSON.stringify({ storageType: "silo", storageCapacity: 500 }),
        isSystem: true,
      },
      {
        presetType: "sand_design",
        name: "165 ton/stage",
        description: "Standard 165 ton per stage design",
        data: JSON.stringify({ tonsPerStage: 165 }),
        isSystem: true,
      },
      {
        presetType: "sand_design",
        name: "220 ton/stage",
        description: "Heavy 220 ton per stage design",
        data: JSON.stringify({ tonsPerStage: 220 }),
        isSystem: true,
      },
    ]);
    console.log("System presets seeded");
  }
}

async function cleanupScenarios() {
  const allScenarios = await db.select().from(scenarios);

  const e2eSandbox = allScenarios.find(s => s.name === "E2E Test Sandbox");
  if (e2eSandbox) {
    await db.delete(fracDailyEvents).where(eq(fracDailyEvents.scenarioId, e2eSandbox.id));
    await db.delete(allocationBlocks).where(eq(allocationBlocks.scenarioId, e2eSandbox.id));
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.scenarioId, e2eSandbox.id));
    await db.delete(scenarios).where(eq(scenarios.id, e2eSandbox.id));
    console.log("Deleted E2E Test Sandbox scenario");
  }

  const baseline = allScenarios.find(s => s.name === "Baseline Q1 2026" && s.locked);
  if (baseline) {
    await db.delete(fracDailyEvents).where(eq(fracDailyEvents.scenarioId, baseline.id));
    await db.delete(allocationBlocks).where(eq(allocationBlocks.scenarioId, baseline.id));
    await db.delete(scenarioFracSchedules).where(eq(scenarioFracSchedules.scenarioId, baseline.id));
    await db.delete(scenarios).where(eq(scenarios.id, baseline.id));
    console.log("Deleted locked Baseline Q1 2026 scenario");
  }

  const forecast = allScenarios.find(s => s.name === "Forecast Q1 2026");
  if (forecast) {
    await db.update(scenarios).set({ name: "Actual Schedule", type: "actual" }).where(eq(scenarios.id, forecast.id));
    console.log("Renamed Forecast Q1 2026 to Actual Schedule");
  }
}

export async function seedDatabase() {
  await cleanupOrphanedData();
  if (process.env.NODE_ENV !== "production") {
    await cleanupScenarios();
  }
  await seedPresets();

  const existingLanes = await db.select().from(lanes);
  if (existingLanes.length > 0) return;

  const [lane1] = await db.insert(lanes).values([
    { name: "EVO1", color: "#3b82f6", sortOrder: 0 },
    { name: "EVO10", color: "#f97316", sortOrder: 1 },
    { name: "FLEET3", color: "#10b981", sortOrder: 2 },
    { name: "FLEET4", color: "#8b5cf6", sortOrder: 3 },
  ]).returning();

  const allLanes = await db.select().from(lanes);

  const [actualScenario] = await db.insert(scenarios).values([
    { name: "Actual Schedule", type: "actual", locked: false },
  ]).returning();

  const forecast = actualScenario;

  const createdJobs = await db.insert(fracJobs).values([
    {
      padName: "BIG177",
      laneId: allLanes[0].id,
      customer: "COP",
      basin: "Permian",
      stagesPerDay: 8,
      tonsPerStage: 500,
      totalStages: 160,
      travelTimeHours: 1.5,
      avgTonsPerLoad: 24,
      storageType: "silo",
      storageCapacity: 200,
    },
    {
      padName: "MINGO22",
      laneId: allLanes[0].id,
      customer: "Devon",
      basin: "Permian",
      stagesPerDay: 6,
      tonsPerStage: 450,
      totalStages: 120,
      travelTimeHours: 2.0,
      avgTonsPerLoad: 24,
      storageType: "kube",
      storageCapacity: 150,
    },
    {
      padName: "TEAMWORK44",
      laneId: allLanes[1].id,
      customer: "Pioneer",
      basin: "Delaware",
      stagesPerDay: 10,
      tonsPerStage: 550,
      totalStages: 200,
      travelTimeHours: 1.0,
      avgTonsPerLoad: 25,
      storageType: "silo",
      storageCapacity: 250,
    },
    {
      padName: "EAGLE99",
      laneId: allLanes[2].id,
      customer: "EOG",
      basin: "Midland",
      stagesPerDay: 7,
      tonsPerStage: 480,
      totalStages: 140,
      travelTimeHours: 1.8,
      avgTonsPerLoad: 24,
      storageType: "silo",
      storageCapacity: 180,
    },
    {
      padName: "HAWK15",
      laneId: allLanes[3].id,
      customer: "Diamondback",
      basin: "Permian",
      stagesPerDay: 9,
      tonsPerStage: 520,
      totalStages: 180,
      travelTimeHours: 1.2,
      avgTonsPerLoad: 25,
      storageType: "kube",
      storageCapacity: 200,
    },
  ]).returning();

  await db.insert(scenarioFracSchedules).values([
    {
      scenarioId: forecast.id,
      fracJobId: createdJobs[0].id,
      plannedStartDate: "2026-02-22",
      plannedEndDate: "2026-03-13",
      transitionDaysAfter: 3,
      requiredTrucksPerShift: 12,
      status: "active",
    },
    {
      scenarioId: forecast.id,
      fracJobId: createdJobs[1].id,
      plannedStartDate: "2026-03-16",
      plannedEndDate: "2026-04-04",
      transitionDaysAfter: 2,
      requiredTrucksPerShift: 10,
      status: "planned",
    },
    {
      scenarioId: forecast.id,
      fracJobId: createdJobs[2].id,
      plannedStartDate: "2026-02-25",
      plannedEndDate: "2026-03-16",
      transitionDaysAfter: 3,
      requiredTrucksPerShift: 14,
      status: "active",
    },
    {
      scenarioId: forecast.id,
      fracJobId: createdJobs[3].id,
      plannedStartDate: "2026-03-01",
      plannedEndDate: "2026-03-20",
      transitionDaysAfter: 2,
      requiredTrucksPerShift: 11,
      status: "planned",
    },
    {
      scenarioId: forecast.id,
      fracJobId: createdJobs[4].id,
      plannedStartDate: "2026-03-05",
      plannedEndDate: "2026-03-24",
      transitionDaysAfter: 3,
      requiredTrucksPerShift: 13,
      status: "planned",
    },
  ]);

  const createdHaulers = await db.insert(haulers).values([
    { name: "ET", splitAllowed: false, homeArea: "Midland", defaultMaxTrucksPerShift: 15, defaultMinCommittedTrucksPerShift: 8 },
    { name: "HWE", splitAllowed: false, homeArea: "Pecos", defaultMaxTrucksPerShift: 12, defaultMinCommittedTrucksPerShift: 5 },
    { name: "Seven Point", splitAllowed: false, homeArea: "Odessa", defaultMaxTrucksPerShift: 10, defaultMinCommittedTrucksPerShift: 4 },
    { name: "Revolution", splitAllowed: true, homeArea: "Midland", defaultMaxTrucksPerShift: 20, defaultMinCommittedTrucksPerShift: 10 },
    { name: "Patriot", splitAllowed: false, homeArea: "Carlsbad", defaultMaxTrucksPerShift: 8, defaultMinCommittedTrucksPerShift: 3 },
  ]).returning();

  await db.insert(allocationBlocks).values([
    { scenarioId: forecast.id, fracJobId: createdJobs[0].id, haulerId: createdHaulers[0].id, startDate: "2026-02-22", endDate: "2026-03-03", trucksPerShift: 8 },
    { scenarioId: forecast.id, fracJobId: createdJobs[0].id, haulerId: createdHaulers[1].id, startDate: "2026-02-22", endDate: "2026-03-03", trucksPerShift: 4 },
    { scenarioId: forecast.id, fracJobId: createdJobs[2].id, haulerId: createdHaulers[3].id, startDate: "2026-02-25", endDate: "2026-03-10", trucksPerShift: 10 },
    { scenarioId: forecast.id, fracJobId: createdJobs[2].id, haulerId: createdHaulers[2].id, startDate: "2026-02-25", endDate: "2026-03-10", trucksPerShift: 4 },
    { scenarioId: forecast.id, fracJobId: createdJobs[3].id, haulerId: createdHaulers[4].id, startDate: "2026-03-01", endDate: "2026-03-15", trucksPerShift: 6 },
    { scenarioId: forecast.id, fracJobId: createdJobs[4].id, haulerId: createdHaulers[3].id, startDate: "2026-03-10", endDate: "2026-03-20", trucksPerShift: 8 },
  ]);

  console.log("Database seeded successfully");
}
