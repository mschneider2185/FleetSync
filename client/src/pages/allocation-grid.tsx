import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
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
const COL_WIDTH = 56;
const LABEL_WIDTH = 220;

interface EditingCell {
  fracJobId: number;
  haulerId: number;
  dateStr: string;
  allocId: number | null;
  originalValue: number;
}

interface AllocationGridContentProps {
  compact?: boolean;
  externalStartDate?: Date;
  selectedDate?: string | null;
}

export function AllocationGridContent({ compact = false, externalStartDate, selectedDate: selectedDateProp }: AllocationGridContentProps) {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [internalStartDate, setInternalStartDate] = useState(() => startOfDay(new Date()));
  const startDate = externalStartDate || internalStartDate;
  const setStartDate = externalStartDate ? () => {} : setInternalStartDate;
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [allocDialogFrac, setAllocDialogFrac] = useState<number | undefined>();
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

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

  const getAllocForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string) => {
    return allocations.find(a =>
      a.fracJobId === fracJobId && a.haulerId === haulerId &&
      a.startDate <= dateStr && a.endDate >= dateStr
    ) || null;
  }, [allocations]);

  const getTrucksForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string) => {
    const alloc = getAllocForDay(fracJobId, haulerId, dateStr);
    return alloc ? alloc.trucksPerShift : 0;
  }, [getAllocForDay]);

  const getTotalForFracDay = useCallback((fracJobId: number, dateStr: string) => {
    return allocations
      .filter(a => a.fracJobId === fracJobId && a.startDate <= dateStr && a.endDate >= dateStr)
      .reduce((sum, a) => sum + a.trucksPerShift, 0);
  }, [allocations]);

  const getCellColor = (assigned: number, required: number) => {
    if (required === 0) return "";
    if (assigned === 0) return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400";
    const deviation = Math.abs(assigned - required);
    if (deviation === 0) return "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400";
    if (deviation === 1) return "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400";
    return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400";
  };

  const isSchedActiveOnDate = (schedule: ScenarioFracSchedule, dateStr: string) => {
    return schedule.plannedStartDate <= dateStr && schedule.plannedEndDate >= dateStr;
  };

  const today = format(new Date(), "yyyy-MM-dd");

  const refreshAllocations = async () => {
    await queryClient.refetchQueries({ queryKey: ["/api/scenarios", activeScenarioId, "allocations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "conflicts"] });
  };

  const updateAllocMutation = useMutation({
    mutationFn: async ({ allocId, trucksPerShift }: { allocId: number; trucksPerShift: number }) => {
      return apiRequest("PATCH", `/api/allocations/${allocId}`, { trucksPerShift });
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update allocation", variant: "destructive" });
    },
  });

  const createAllocMutation = useMutation({
    mutationFn: async (payload: { fracJobId: number; haulerId: number; startDate: string; endDate: string; trucksPerShift: number; scenarioId: number }) => {
      return apiRequest("POST", "/api/allocations", payload);
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create allocation", variant: "destructive" });
    },
  });

  const deleteAllocMutation = useMutation({
    mutationFn: async (allocId: number) => {
      return apiRequest("DELETE", `/api/allocations/${allocId}`);
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete allocation", variant: "destructive" });
    },
  });

  const splitAndEditMutation = useMutation({
    mutationFn: async ({ alloc, dateStr, newValue }: { alloc: AllocationBlock; dateStr: string; newValue: number }) => {
      const prevDay = format(addDays(new Date(dateStr + "T00:00:00"), -1), "yyyy-MM-dd");
      const nextDay = format(addDays(new Date(dateStr + "T00:00:00"), 1), "yyyy-MM-dd");

      await apiRequest("DELETE", `/api/allocations/${alloc.id}`);

      if (alloc.startDate < dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId,
          fracJobId: alloc.fracJobId,
          haulerId: alloc.haulerId,
          startDate: alloc.startDate,
          endDate: prevDay,
          trucksPerShift: alloc.trucksPerShift,
        });
      }

      if (newValue > 0) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId,
          fracJobId: alloc.fracJobId,
          haulerId: alloc.haulerId,
          startDate: dateStr,
          endDate: dateStr,
          trucksPerShift: newValue,
        });
      }

      if (alloc.endDate > dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId,
          fracJobId: alloc.fracJobId,
          haulerId: alloc.haulerId,
          startDate: nextDay,
          endDate: alloc.endDate,
          trucksPerShift: alloc.trucksPerShift,
        });
      }
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update allocation", variant: "destructive" });
    },
  });

  const startEditing = (fracJobId: number, haulerId: number, dateStr: string) => {
    if (isSavingRef.current) return;
    const alloc = getAllocForDay(fracJobId, haulerId, dateStr);
    const currentValue = alloc ? alloc.trucksPerShift : 0;
    setEditingCell({
      fracJobId,
      haulerId,
      dateStr,
      allocId: alloc?.id || null,
      originalValue: currentValue,
    });
    setEditValue(currentValue > 0 ? currentValue.toString() : "");
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const commitEdit = useCallback(() => {
    if (isSavingRef.current || !editingCell || !activeScenarioId) return;
    isSavingRef.current = true;

    const newValue = parseInt(editValue) || 0;
    const cell = editingCell;

    setEditingCell(null);
    setEditValue("");

    const resetGuard = () => { isSavingRef.current = false; };

    if (newValue === cell.originalValue) {
      resetGuard();
      return;
    }

    try {
      if (cell.allocId) {
        const alloc = allocations.find(a => a.id === cell.allocId);
        if (alloc && (alloc.startDate < cell.dateStr || alloc.endDate > cell.dateStr)) {
          splitAndEditMutation.mutate({ alloc, dateStr: cell.dateStr, newValue }, { onSettled: resetGuard });
        } else if (newValue === 0) {
          deleteAllocMutation.mutate(cell.allocId, { onSettled: resetGuard });
        } else {
          updateAllocMutation.mutate({ allocId: cell.allocId, trucksPerShift: newValue }, { onSettled: resetGuard });
        }
      } else if (newValue > 0) {
        createAllocMutation.mutate({
          fracJobId: cell.fracJobId,
          haulerId: cell.haulerId,
          startDate: cell.dateStr,
          endDate: cell.dateStr,
          trucksPerShift: newValue,
          scenarioId: activeScenarioId,
        }, { onSettled: resetGuard });
      } else {
        resetGuard();
      }
    } catch {
      resetGuard();
    }
  }, [editingCell, editValue, activeScenarioId, allocations, splitAndEditMutation, deleteAllocMutation, updateAllocMutation, createAllocMutation]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      requestAnimationFrame(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      });
    }
  }, [editingCell]);

  const allHaulerIdsForFrac = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const schedule of activeSchedules) {
      const fracAllocations = allocations.filter(a => a.fracJobId === schedule.fracJobId);
      const haulerIds = [...new Set(fracAllocations.map(a => a.haulerId))];
      map.set(schedule.fracJobId, haulerIds);
    }
    return map;
  }, [activeSchedules, allocations]);

  const tableWidth = LABEL_WIDTH + DAYS_VISIBLE * COL_WIDTH;

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center justify-between gap-4 px-4 ${compact ? "py-1.5" : "py-3"} border-b bg-background shrink-0`}>
        <div className="flex items-center gap-4 flex-wrap">
          {!compact && (
            <>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="heading-allocation-grid">Allocation Grid</h1>
              <ScenarioSelector />
            </>
          )}
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
        <div className="flex-1 overflow-auto relative">
          <table
            className="border-collapse text-xs"
            style={{ tableLayout: "fixed", minWidth: tableWidth, width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }} />
              {dates.map((_, i) => (
                <col key={i} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky left-0 z-30 bg-background border-b border-r px-3 py-2 text-left font-medium text-muted-foreground"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                >
                  Frac / Hauler
                </th>
                {dates.map((date, i) => {
                  const ds = dateStrings[i];
                  const isToday = ds === today;
                  const isSelected = ds === selectedDateProp;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th
                      key={i}
                      className={`border-b border-r px-1 py-1.5 text-center font-normal ${
                        isSelected ? "bg-primary/15 font-semibold text-primary ring-1 ring-inset ring-primary/30" :
                        isToday ? "bg-primary/10 font-semibold text-primary" :
                        isWeekend ? "bg-muted/40 text-muted-foreground" :
                        "bg-background text-muted-foreground"
                      }`}
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    >
                      <div className="text-[10px] leading-tight">{format(date, "EEE")}</div>
                      <div className="text-xs leading-tight">{format(date, "M/d")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {activeSchedules.map(schedule => {
              const frac = fracMap.get(schedule.fracJobId);
              const lane = frac ? laneMap.get(frac.laneId) : null;
              if (!frac) return null;

              const uniqueHaulerIds = allHaulerIdsForFrac.get(schedule.fracJobId) || [];

              return (
                <tbody key={schedule.id}>
                  <tr className="bg-muted/40">
                    <td
                      className="sticky left-0 z-10 bg-muted/40 border-b border-r px-3 py-2"
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                    >
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
                      if (!active) {
                        return (
                          <td
                            key={i}
                            className="border-b border-r bg-muted/20"
                            style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          />
                        );
                      }
                      const total = getTotalForFracDay(schedule.fracJobId, ds);
                      const diff = total - schedule.requiredTrucksPerShift;
                      return (
                        <td
                          key={i}
                          className={`border-b border-r text-center font-semibold py-1 ${getCellColor(total, schedule.requiredTrucksPerShift)}`}
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          data-testid={`cell-frac-total-${frac.id}-${ds}`}
                        >
                          <div className="leading-tight">{total > 0 ? total : ""}</div>
                          {diff !== 0 && total > 0 && (
                            <div className={`text-[9px] font-normal leading-tight ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
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
                        <td
                          className="sticky left-0 z-10 bg-background border-b border-r px-3 py-1.5 pl-8"
                          style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground truncate">{hauler.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                              max {hauler.defaultMaxTrucksPerShift}
                            </span>
                          </div>
                        </td>
                        {dateStrings.map((ds, i) => {
                          const active = isSchedActiveOnDate(schedule, ds);
                          if (!active) {
                            return (
                              <td
                                key={i}
                                className="border-b border-r"
                                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                              />
                            );
                          }
                          const trucks = getTrucksForDay(schedule.fracJobId, haulerId, ds);
                          const isEditing = editingCell?.fracJobId === schedule.fracJobId &&
                            editingCell?.haulerId === haulerId &&
                            editingCell?.dateStr === ds;

                          if (isEditing) {
                            return (
                              <td
                                key={i}
                                className="border-b border-r p-0"
                                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                              >
                                <input
                                  ref={editInputRef}
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={editValue}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    setEditValue(val);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitEdit();
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelEditing();
                                    }
                                    if (e.key === "Tab") {
                                      e.preventDefault();
                                      commitEdit();
                                    }
                                  }}
                                  onBlur={cancelEditing}
                                  className="w-full h-full text-center text-xs bg-primary/10 border-2 border-primary outline-none py-1"
                                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                                  data-testid={`input-cell-edit-${schedule.fracJobId}-${haulerId}-${ds}`}
                                />
                              </td>
                            );
                          }

                          return (
                            <td
                              key={i}
                              className="border-b border-r text-center py-1 text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
                              style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                              onClick={() => startEditing(schedule.fracJobId, haulerId, ds)}
                              data-testid={`cell-hauler-${schedule.fracJobId}-${haulerId}-${ds}`}
                            >
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

            <tbody>
              <tr className="bg-muted/30">
                <td
                  className="sticky left-0 z-10 bg-muted/30 border-b border-r px-3 py-2 font-semibold text-sm"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  data-testid="text-hauler-totals"
                >
                  Hauler Totals
                </td>
                {dateStrings.map((ds, i) => {
                  const totalAllDay = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds)
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  return (
                    <td
                      key={i}
                      className="border-b border-r text-center font-semibold py-2"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      data-testid={`cell-total-${ds}`}
                    >
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

export default function AllocationGrid() {
  return <AllocationGridContent />;
}
