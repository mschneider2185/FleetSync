import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { ScenarioSelector } from "@/components/scenario-selector";
import { AllocationDialog } from "@/components/allocation-dialog";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Lane, FracJob, ScenarioFracSchedule, AllocationBlock, Hauler, Scenario } from "@shared/schema";

const DAYS_VISIBLE = 21;
const COL_WIDTH = 52;
const LABEL_WIDTH = 200;

export default function AllocationGrid() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [allocDialogFrac, setAllocDialogFrac] = useState<number | undefined>();

  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });
  const { data: fracJobs = [] } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const { data: haulers = [] } = useQuery<Hauler[]>({ queryKey: ["/api/haulers"] });
  const { data: scenarios = [] } = useQuery<Scenario[]>({ queryKey: ["/api/scenarios"] });

  const { data: schedules = [], isLoading } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: allocations = [] } = useQuery<AllocationBlock[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "allocations"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/allocations`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const dates = useMemo(() =>
    Array.from({ length: DAYS_VISIBLE }, (_, i) => addDays(startDate, i)),
    [startDate]
  );
  const dateStrings = useMemo(() => dates.map(d => format(d, "yyyy-MM-dd")), [dates]);

  const fracMap = useMemo(() => new Map(fracJobs.map(f => [f.id, f])), [fracJobs]);
  const haulerMap = useMemo(() => new Map(haulers.map(h => [h.id, h])), [haulers]);
  const laneMap = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);

  const activeSchedules = useMemo(() => {
    const endDateStr = format(addDays(startDate, DAYS_VISIBLE), "yyyy-MM-dd");
    const startDateStr = format(startDate, "yyyy-MM-dd");
    return schedules.filter(s => s.plannedEndDate >= startDateStr && s.plannedStartDate <= endDateStr);
  }, [schedules, startDate]);

  const getTrucksForDay = (fracJobId: number, haulerId: number, dateStr: string) => {
    const alloc = allocations.find(a =>
      a.fracJobId === fracJobId && a.haulerId === haulerId &&
      a.startDate <= dateStr && a.endDate >= dateStr
    );
    return alloc ? alloc.trucksPerShift : 0;
  };

  const getTotalForFracDay = (fracJobId: number, dateStr: string) => {
    return allocations
      .filter(a => a.fracJobId === fracJobId && a.startDate <= dateStr && a.endDate >= dateStr)
      .reduce((sum, a) => sum + a.trucksPerShift, 0);
  };

  const getCellColor = (assigned: number, required: number) => {
    if (required === 0) return "";
    if (assigned === 0) return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400";
    if (assigned < required) return "bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400";
    if (assigned === required) return "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400";
    return "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400";
  };

  const isSchedActiveOnDate = (schedule: ScenarioFracSchedule, dateStr: string) => {
    return schedule.plannedStartDate <= dateStr && schedule.plannedEndDate >= dateStr;
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-semibold tracking-tight">Allocation Grid</h1>
          <ScenarioSelector />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStartDate(d => addDays(d, -7))} data-testid="button-grid-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(startOfDay(new Date()))} data-testid="button-grid-today">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(d => addDays(d, 7))} data-testid="button-grid-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : activeSchedules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">No active frac jobs in this date range</p>
            <p className="text-sm text-muted-foreground">Adjust the date range or add frac jobs to a scenario</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: LABEL_WIDTH + DAYS_VISIBLE * COL_WIDTH }}>
            <colgroup>
              <col style={{ width: LABEL_WIDTH }} />
              {dates.map((_, i) => (
                <col key={i} style={{ width: COL_WIDTH }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                <th className="sticky left-0 z-30 bg-background border-b border-r px-3 py-2 text-left font-medium text-muted-foreground" style={{ width: LABEL_WIDTH }}>
                  Frac / Hauler
                </th>
                {dates.map((date, i) => {
                  const ds = dateStrings[i];
                  const isToday = ds === today;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th
                      key={i}
                      className={`border-b border-r px-1 py-1 text-center font-normal ${
                        isToday ? "bg-primary/5 font-semibold text-primary" :
                        isWeekend ? "bg-muted/30 text-muted-foreground" :
                        "text-muted-foreground"
                      }`}
                      style={{ width: COL_WIDTH }}
                    >
                      <div className="text-[10px]">{format(date, "EEE")}</div>
                      <div>{format(date, "M/d")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeSchedules.map(schedule => {
                const frac = fracMap.get(schedule.fracJobId);
                const lane = frac ? laneMap.get(frac.laneId) : null;
                if (!frac) return null;

                const fracAllocations = allocations.filter(a => a.fracJobId === schedule.fracJobId);
                const uniqueHaulerIds = [...new Set(fracAllocations.map(a => a.haulerId))];

                return (
                  <tbody key={schedule.id}>
                    <tr className="bg-muted/40">
                      <td className="sticky left-0 z-10 bg-muted/40 border-b border-r px-3 py-2" style={{ width: LABEL_WIDTH }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {lane && (
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: lane.color }} />
                            )}
                            <span className="font-semibold text-sm truncate" data-testid={`text-grid-frac-${frac.id}`}>{frac.padName}</span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              Needs {schedule.requiredTrucksPerShift}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => {
                              setAllocDialogFrac(frac.id);
                              setAllocDialogOpen(true);
                            }}
                            data-testid={`button-add-alloc-${frac.id}`}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                      {dateStrings.map((ds, i) => {
                        const active = isSchedActiveOnDate(schedule, ds);
                        if (!active) return <td key={i} className="border-b border-r bg-muted/20" style={{ width: COL_WIDTH }} />;
                        const total = getTotalForFracDay(schedule.fracJobId, ds);
                        const diff = total - schedule.requiredTrucksPerShift;
                        return (
                          <td
                            key={i}
                            className={`border-b border-r text-center font-semibold py-1 ${getCellColor(total, schedule.requiredTrucksPerShift)}`}
                            style={{ width: COL_WIDTH }}
                          >
                            {total > 0 ? total : ""}
                            {diff !== 0 && total > 0 && (
                              <div className="text-[9px] font-normal">
                                {diff > 0 ? `+${diff}` : diff}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {uniqueHaulerIds.map(haulerId => {
                      const hauler = haulerMap.get(haulerId);
                      if (!hauler) return null;
                      return (
                        <tr key={`${schedule.id}-${haulerId}`}>
                          <td className="sticky left-0 z-10 bg-background border-b border-r px-3 py-1.5 pl-8" style={{ width: LABEL_WIDTH }}>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground truncate">{hauler.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                max {hauler.defaultMaxTrucksPerShift}
                              </span>
                            </div>
                          </td>
                          {dateStrings.map((ds, i) => {
                            const active = isSchedActiveOnDate(schedule, ds);
                            if (!active) return <td key={i} className="border-b border-r" style={{ width: COL_WIDTH }} />;
                            const trucks = getTrucksForDay(schedule.fracJobId, haulerId, ds);
                            return (
                              <td key={i} className="border-b border-r text-center py-1 text-muted-foreground" style={{ width: COL_WIDTH }}>
                                {trucks > 0 ? trucks : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}

              <tr className="bg-muted/30">
                <td className="sticky left-0 z-10 bg-muted/30 border-b border-r px-3 py-2 font-semibold text-sm" style={{ width: LABEL_WIDTH }}>
                  Hauler Totals
                </td>
                {dateStrings.map((ds, i) => {
                  const totalAllDay = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds)
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  return (
                    <td key={i} className="border-b border-r text-center font-semibold py-2" style={{ width: COL_WIDTH }}>
                      {totalAllDay > 0 ? totalAllDay : ""}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <AllocationDialog
        open={allocDialogOpen}
        onOpenChange={(open) => {
          setAllocDialogOpen(open);
          if (!open) setAllocDialogFrac(undefined);
        }}
        defaultFracJobId={allocDialogFrac}
      />
    </div>
  );
}
