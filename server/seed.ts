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

  const existingFracJobs = await db.select().from(fracJobs);
  if (existingFracJobs.length > 0) return;

  console.log("Seeding production data...");

  const existingLanes = await db.select().from(lanes);
  let laneMap: Record<string, number> = {};
  if (existingLanes.length > 0) {
    for (const l of existingLanes) laneMap[l.name] = l.id;
  }

  const laneData = [
    { name: "EVO1", color: "#3b82f6", sortOrder: 0 },
    { name: "EVO10", color: "#f97316", sortOrder: 1 },
    { name: "EVO13", color: "#10b981", sortOrder: 2 },
  ];
  for (const ld of laneData) {
    if (!laneMap[ld.name]) {
      const [created] = await db.insert(lanes).values(ld).returning();
      laneMap[created.name] = created.id;
    }
  }

  const existingHaulers = await db.select().from(haulers);
  let haulerMap: Record<string, number> = {};
  if (existingHaulers.length > 0) {
    for (const h of existingHaulers) haulerMap[h.name] = h.id;
  }

  const haulerData = [
    { name: "Energy Transportation", splitAllowed: true, homeArea: "Clarksburg, WV", defaultMaxTrucksPerShift: 10, defaultMinCommittedTrucksPerShift: 6 },
    { name: "HWE", splitAllowed: true, homeArea: null, defaultMaxTrucksPerShift: 9, defaultMinCommittedTrucksPerShift: 6 },
    { name: "Seven Point", splitAllowed: true, homeArea: "Waynesburg, PA", defaultMaxTrucksPerShift: 7, defaultMinCommittedTrucksPerShift: 5 },
    { name: "Revolution", splitAllowed: true, homeArea: null, defaultMaxTrucksPerShift: 19, defaultMinCommittedTrucksPerShift: 12 },
    { name: "Myers", splitAllowed: true, homeArea: null, defaultMaxTrucksPerShift: 6, defaultMinCommittedTrucksPerShift: 3 },
    { name: "STAAR Logistics", splitAllowed: true, homeArea: "Brookeville PA", defaultMaxTrucksPerShift: 4, defaultMinCommittedTrucksPerShift: 0 },
    { name: "Haulin Jack", splitAllowed: true, homeArea: null, defaultMaxTrucksPerShift: 4, defaultMinCommittedTrucksPerShift: 0 },
  ];
  for (const hd of haulerData) {
    if (!haulerMap[hd.name]) {
      const [created] = await db.insert(haulers).values(hd).returning();
      haulerMap[created.name] = created.id;
    }
  }

  const h = {
    et: haulerMap["Energy Transportation"],
    hwe: haulerMap["HWE"],
    sp: haulerMap["Seven Point"],
    rev: haulerMap["Revolution"],
    my: haulerMap["Myers"],
    staar: haulerMap["STAAR Logistics"],
    hj: haulerMap["Haulin Jack"],
  };

  const fracData = [
    { padName: "BIG177", laneId: laneMap["EVO1"], customer: "EQT", basin: "Wetzel WV", notes: "\t• PO#000491895 < Tidewater\n\t• PO#000491928 < Waynesburg", stagesPerDay: 13, tonsPerStage: 220, totalStages: 417, travelTimeHours: 4.3, avgTonsPerLoad: 21.5, storageType: "kube", storageCapacity: 1195, loadUnloadTimeHours: 0.5 },
    { padName: "Leto", laneId: laneMap["EVO10"], customer: "EQT", basin: "PA", stagesPerDay: 4, tonsPerStage: 220, totalStages: 316, travelTimeHours: 3.5, avgTonsPerLoad: 26.5, storageType: "silo", storageCapacity: 500, loadUnloadTimeHours: 0.25 },
    { padName: "COP Tract 027B A", laneId: laneMap["EVO13"], customer: "EQT", basin: "NEPA", notes: "\t• Iron Oak Williamsport PO# 000497363 < Primary\n\t• Iron Oak Wellsboro PO# 000501958 < Secondary", stagesPerDay: 10.5, tonsPerStage: 220, totalStages: 334, travelTimeHours: 4.5, avgTonsPerLoad: 26.5, storageType: "silo", storageCapacity: 500, loadUnloadTimeHours: 0.75 },
    { padName: "COP Tract 027B B", laneId: laneMap["EVO13"], customer: "EQT", basin: "NEPA", notes: "\t• Iron Oak Williamsport PO# 000497363 < Primary\n\t• Iron Oak Wellsboro PO# 000501958 < Secondary", stagesPerDay: 10.5, tonsPerStage: 220, totalStages: 334, travelTimeHours: 4.5, avgTonsPerLoad: 26.5, storageType: "silo", storageCapacity: 500, loadUnloadTimeHours: 0.75 },
    { padName: "Franklin Denny", laneId: laneMap["EVO1"], customer: "EQT", basin: "SWPA", notes: "Smartsand Waynesburg: PO#000500641 ", stagesPerDay: 11.4, tonsPerStage: 220, totalStages: 401, travelTimeHours: 3.8, avgTonsPerLoad: 26.5, storageType: "kube", storageCapacity: 2500, loadUnloadTimeHours: 0.5 },
    { padName: "Teamwork", laneId: laneMap["EVO13"], customer: "EQT", basin: "PA", stagesPerDay: 10, tonsPerStage: 220, totalStages: 237, travelTimeHours: 3.3, avgTonsPerLoad: 26.5, storageType: "silo", storageCapacity: 500, loadUnloadTimeHours: 0.4 },
    { padName: "Hallibu", laneId: laneMap["EVO1"], customer: "EQT", basin: "BWN", stagesPerDay: 10, tonsPerStage: 220, totalStages: 650, travelTimeHours: 3.5, avgTonsPerLoad: 26.5, storageType: "kube", storageCapacity: 2500, loadUnloadTimeHours: 0.5 },
    { padName: "Shalennial", laneId: laneMap["EVO1"], customer: "EQT", basin: "SWPA", notes: "Smartsand Waynesburg:", stagesPerDay: 11.4, tonsPerStage: 220, totalStages: 401, travelTimeHours: 3.8, avgTonsPerLoad: 26.5, storageType: "kube", storageCapacity: 2500, loadUnloadTimeHours: 0.5 },
    { padName: "Mingo", laneId: laneMap["EVO10"], customer: "EQT", basin: "SWPA", stagesPerDay: 13.7, tonsPerStage: 165, totalStages: 801, travelTimeHours: 3.5, avgTonsPerLoad: 26.5, storageType: "silo", storageCapacity: 500, loadUnloadTimeHours: 0.5 },
  ];

  const createdJobs = await db.insert(fracJobs).values(fracData).returning();
  const fj: Record<string, number> = {};
  for (const j of createdJobs) fj[j.padName] = j.id;

  let existingScenario = (await db.select().from(scenarios)).find(s => s.type === "actual");
  if (!existingScenario) {
    const [created] = await db.insert(scenarios).values({ name: "Actual Schedule", type: "actual", locked: false }).returning();
    existingScenario = created;
  }
  const scenarioId = existingScenario.id;

  await db.insert(scenarioFracSchedules).values([
    { scenarioId, fracJobId: fj["BIG177"], plannedStartDate: "2026-02-22", plannedEndDate: "2026-03-30", transitionDaysAfter: 3, requiredTrucksPerShift: 30, status: "active" },
    { scenarioId, fracJobId: fj["Leto"], plannedStartDate: "2026-03-04", plannedEndDate: "2026-05-22", transitionDaysAfter: 2, requiredTrucksPerShift: 6, status: "planned" },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], plannedStartDate: "2026-02-26", plannedEndDate: "2026-03-28", transitionDaysAfter: 2, requiredTrucksPerShift: 21, status: "active" },
    { scenarioId, fracJobId: fj["COP Tract 027B B"], plannedStartDate: "2026-03-31", plannedEndDate: "2026-05-02", transitionDaysAfter: 2, requiredTrucksPerShift: 21, status: "planned" },
    { scenarioId, fracJobId: fj["Franklin Denny"], plannedStartDate: "2026-04-03", plannedEndDate: "2026-05-08", transitionDaysAfter: 2, requiredTrucksPerShift: 20, status: "planned" },
    { scenarioId, fracJobId: fj["Teamwork"], plannedStartDate: "2026-01-30", plannedEndDate: "2026-02-22", transitionDaysAfter: 2, requiredTrucksPerShift: 16, status: "complete" },
    { scenarioId, fracJobId: fj["Hallibu"], plannedStartDate: "2025-12-16", plannedEndDate: "2026-02-17", transitionDaysAfter: 2, requiredTrucksPerShift: 21, status: "complete" },
    { scenarioId, fracJobId: fj["Shalennial"], plannedStartDate: "2026-05-11", plannedEndDate: "2026-06-15", transitionDaysAfter: 2, requiredTrucksPerShift: 17, status: "planned" },
    { scenarioId, fracJobId: fj["Mingo"], plannedStartDate: "2025-12-27", plannedEndDate: "2026-02-28", transitionDaysAfter: 2, requiredTrucksPerShift: 15, status: "complete" },
  ]);

  await db.insert(allocationBlocks).values([
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.et, startDate: "2026-02-22", endDate: "2026-03-30", trucksPerShift: 10 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.hwe, startDate: "2026-02-22", endDate: "2026-03-30", trucksPerShift: 9 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.sp, startDate: "2026-02-22", endDate: "2026-03-02", trucksPerShift: 7 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.sp, startDate: "2026-03-03", endDate: "2026-03-04", trucksPerShift: 8 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.sp, startDate: "2026-03-05", endDate: "2026-03-30", trucksPerShift: 7 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.rev, startDate: "2026-03-02", endDate: "2026-03-30", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.my, startDate: "2026-03-03", endDate: "2026-03-31", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["BIG177"], haulerId: h.staar, startDate: "2026-02-22", endDate: "2026-02-24", trucksPerShift: 1 },
    { scenarioId, fracJobId: fj["Leto"], haulerId: h.my, startDate: "2026-03-03", endDate: "2026-03-03", trucksPerShift: 6 },
    { scenarioId, fracJobId: fj["Leto"], haulerId: h.my, startDate: "2026-03-04", endDate: "2026-03-04", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["Leto"], haulerId: h.my, startDate: "2026-03-05", endDate: "2026-05-22", trucksPerShift: 6 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.rev, startDate: "2026-02-26", endDate: "2026-03-02", trucksPerShift: 10 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.rev, startDate: "2026-03-03", endDate: "2026-03-28", trucksPerShift: 15 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.staar, startDate: "2026-02-26", endDate: "2026-02-27", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.staar, startDate: "2026-02-28", endDate: "2026-03-08", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.staar, startDate: "2026-03-09", endDate: "2026-03-28", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.hj, startDate: "2026-02-27", endDate: "2026-02-27", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.hj, startDate: "2026-02-28", endDate: "2026-02-28", trucksPerShift: 3 },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], haulerId: h.hj, startDate: "2026-03-01", endDate: "2026-03-28", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["COP Tract 027B B"], haulerId: h.rev, startDate: "2026-03-31", endDate: "2026-05-02", trucksPerShift: 15 },
    { scenarioId, fracJobId: fj["COP Tract 027B B"], haulerId: h.staar, startDate: "2026-03-31", endDate: "2026-05-02", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["COP Tract 027B B"], haulerId: h.hj, startDate: "2026-03-31", endDate: "2026-05-02", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["Franklin Denny"], haulerId: h.et, startDate: "2026-04-01", endDate: "2026-05-06", trucksPerShift: 8 },
    { scenarioId, fracJobId: fj["Franklin Denny"], haulerId: h.hwe, startDate: "2026-04-01", endDate: "2026-05-06", trucksPerShift: 8 },
    { scenarioId, fracJobId: fj["Franklin Denny"], haulerId: h.rev, startDate: "2026-04-01", endDate: "2026-05-06", trucksPerShift: 4 },
    { scenarioId, fracJobId: fj["Teamwork"], haulerId: h.sp, startDate: "2026-01-30", endDate: "2026-02-22", trucksPerShift: 6 },
    { scenarioId, fracJobId: fj["Teamwork"], haulerId: h.rev, startDate: "2026-01-30", endDate: "2026-02-22", trucksPerShift: 10 },
    { scenarioId, fracJobId: fj["Hallibu"], haulerId: h.et, startDate: "2025-12-16", endDate: "2026-02-17", trucksPerShift: 10 },
    { scenarioId, fracJobId: fj["Hallibu"], haulerId: h.hwe, startDate: "2026-01-16", endDate: "2026-02-17", trucksPerShift: 9 },
    { scenarioId, fracJobId: fj["Hallibu"], haulerId: h.rev, startDate: "2026-01-16", endDate: "2026-02-17", trucksPerShift: 2 },
    { scenarioId, fracJobId: fj["Mingo"], haulerId: h.rev, startDate: "2025-12-27", endDate: "2026-02-28", trucksPerShift: 9 },
    { scenarioId, fracJobId: fj["Mingo"], haulerId: h.my, startDate: "2025-12-26", endDate: "2026-02-28", trucksPerShift: 6 },
  ]);

  await db.insert(fracDailyEvents).values([
    { scenarioId, fracJobId: fj["COP Tract 027B A"], date: "2026-02-28", shift: "both", category: "NPT", hoursLost: 5.93, notes: "Short on trucking to provide daily material needed. Outlined in OB-011987. " },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], date: "2026-02-27", shift: "both", category: "WAITING ON SAND", hoursLost: 6.6, notes: "Waiting on sand trucks (ramp/mechanical constraints noted)" },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], date: "2026-02-28", shift: "both", category: "WAITING ON SAND", hoursLost: 5.93, notes: "Waiting on sand trucks" },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], date: "2026-03-01", shift: "both", category: "WAITING ON SAND", hoursLost: 4.08, notes: "Waiting on sand trucks" },
    { scenarioId, fracJobId: fj["COP Tract 027B A"], date: "2026-03-02", shift: "both", category: "WAITING ON SAND", hoursLost: 2.17, notes: "Waiting on sand trucks" },
    { scenarioId, fracJobId: fj["Mingo"], date: "2026-02-25", shift: "both", category: "WAITING ON SAND", hoursLost: 6.51, notes: "Waiting on sand (transload changeover between Smithfield & 84 yards)" },
    { scenarioId, fracJobId: fj["Mingo"], date: "2026-02-26", shift: "both", category: "WAITING ON SAND", hoursLost: 2.46, notes: "Waiting on sand (transload facility transition delays)" },
    { scenarioId, fracJobId: fj["Mingo"], date: "2026-02-28", shift: "both", category: "WAITING ON SAND", hoursLost: 0.2, notes: "Waiting on last load of sand" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-02-24", shift: "both", category: "WAITING ON SAND", hoursLost: 2.73, notes: "Waiting on sand trucks (inefficiencies, breakdowns)" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-02-25", shift: "both", category: "WAITING ON SAND", hoursLost: 1.68, notes: "Waiting on 11 loads (double curfew impact)" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-02-26", shift: "both", category: "WAITING ON SAND", hoursLost: 2.67, notes: "Waiting on 18 loads" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-02-27", shift: "both", category: "WAITING ON SAND", hoursLost: 3.7, notes: "Waiting on sand (11, 2, 3 loads)" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-02-28", shift: "both", category: "WAITING ON SAND", hoursLost: 1.18, notes: "Waiting on 8 loads" },
    { scenarioId, fracJobId: fj["BIG177"], date: "2026-03-02", shift: "both", category: "WAITING ON SAND", hoursLost: 1.93, notes: "Waiting on 11 loads" },
  ]);

  console.log("Production data seeded successfully");
}
