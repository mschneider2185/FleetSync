import { format } from "date-fns";
import type { ScenarioFracSchedule } from "@shared/schema";

export type EffectiveScheduleStatus = "planned" | "active" | "paused" | "complete";

export function getEffectiveScheduleStatus(
  schedule: Pick<ScenarioFracSchedule, "status" | "plannedStartDate" | "plannedEndDate">,
  todayStr = format(new Date(), "yyyy-MM-dd")
): EffectiveScheduleStatus {
  if (schedule.status === "paused") return "paused";
  if (todayStr < schedule.plannedStartDate) return "planned";
  if (todayStr > schedule.plannedEndDate) return "complete";
  return "active";
}
