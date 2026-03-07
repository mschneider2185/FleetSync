import type { IStorage } from "../storage";

export interface CascadedSchedule {
  id: number;
  plannedStartDate: string;
  plannedEndDate: string;
}

/**
 * When a schedule's plannedEndDate is extended, push downstream schedules in the same lane
 * so they start after (prev end + transition + 1 day). Reused by PATCH /api/schedules/:id and import.
 */
export async function runLaneCascadeAfterEndDateExtend(
  storage: IStorage,
  scenarioId: number,
  scheduleId: number,
  oldSchedule: { fracJobId: number; plannedStartDate: string },
  newPlannedEndDate: string,
  updatedScheduleTransitionDaysAfter: number
): Promise<CascadedSchedule[]> {
  const cascadedSchedules: CascadedSchedule[] = [];
  const frac = await storage.getFracJob(oldSchedule.fracJobId);
  if (!frac) return cascadedSchedules;

  const allSchedules = await storage.getSchedulesByScenario(scenarioId);
  const allFracJobs = await storage.getFracJobs();
  const fracMap = new Map(allFracJobs.map((f) => [f.id, f]));

  const laneSchedules = allSchedules
    .filter((s) => {
      const f = fracMap.get(s.fracJobId);
      return f && f.laneId === frac.laneId && s.id !== scheduleId;
    })
    .sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate));

  let prevEnd = newPlannedEndDate;
  let prevTransition = updatedScheduleTransitionDaysAfter || 0;

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

  return cascadedSchedules;
}
