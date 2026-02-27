import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { startOfDay, parseISO } from "date-fns";
import { GanttChart } from "@/components/gantt-chart";
import { FracDetailPanel } from "@/components/frac-detail-panel";
import { FracJobDialog } from "@/components/frac-job-dialog";
import { LaneDialog } from "@/components/lane-dialog";
import { ScenarioSelector } from "@/components/scenario-selector";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertTriangle, Pencil, Trash2, Route, ChevronDown, ChevronRight, ChevronUp, Truck, Users, Grid3X3, Eye, EyeOff, X } from "lucide-react";
import { AllocationGridContent } from "@/pages/allocation-grid";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Lane, FracJob, ScenarioFracSchedule, AllocationBlock, Hauler, Scenario } from "@shared/schema";

interface Conflict {
  type: string;
  date: string;
  entityId: number;
  entityName: string;
  detail: string;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

const CONFLICT_LABELS: Record<string, { label: string; color: string }> = {
  frac_under_supplied: { label: "Under-Supplied Fracs", color: "text-red-600 dark:text-red-400" },
  hauler_over_capacity: { label: "Hauler Over-Capacity", color: "text-red-600 dark:text-red-400" },
  frac_over_supplied: { label: "Over-Supplied Fracs", color: "text-amber-600 dark:text-amber-400" },
  hauler_split_warning: { label: "Hauler Split Warnings", color: "text-amber-600 dark:text-amber-400" },
};

function ConflictSheet({ open, onOpenChange, hardConflicts, warnings }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hardConflicts: Conflict[];
  warnings: Conflict[];
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    frac_under_supplied: true,
    hauler_over_capacity: true,
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const dismissEntity = (type: string, entityId: number) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(`${type}-${entityId}`);
      return next;
    });
  };

  const restoreEntity = (type: string, entityId: number) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(`${type}-${entityId}`);
      return next;
    });
  };

  const dismissAllOfType = (type: string, entityIds: number[]) => {
    setDismissed(prev => {
      const next = new Set(prev);
      entityIds.forEach(id => next.add(`${type}-${id}`));
      return next;
    });
  };

  const toggleSection = (type: string) => {
    setExpandedSections(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const groupByType = (items: Conflict[]) => {
    const groups: Record<string, Conflict[]> = {};
    for (const c of items) {
      if (!groups[c.type]) groups[c.type] = [];
      groups[c.type].push(c);
    }
    return groups;
  };

  const groupByEntity = (items: Conflict[]) => {
    const groups: Record<string, { entityId: number; entityName: string; dates: { date: string; detail: string }[] }> = {};
    for (const c of items) {
      const key = `${c.entityId}`;
      if (!groups[key]) groups[key] = { entityId: c.entityId, entityName: c.entityName, dates: [] };
      groups[key].dates.push({ date: c.date, detail: c.detail });
    }
    for (const g of Object.values(groups)) {
      g.dates.sort((a, b) => a.date.localeCompare(b.date));
    }
    return Object.values(groups);
  };

  const collapseRanges = (dates: { date: string; detail: string }[]) => {
    if (dates.length === 0) return [];
    const ranges: { startDate: string; endDate: string; detail: string; count: number }[] = [];
    let current = { startDate: dates[0].date, endDate: dates[0].date, detail: dates[0].detail, count: 1 };

    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(current.endDate);
      prevDate.setDate(prevDate.getDate() + 1);
      const nextDay = prevDate.toISOString().split("T")[0];

      if (dates[i].date === nextDay && dates[i].detail === current.detail) {
        current.endDate = dates[i].date;
        current.count++;
      } else {
        ranges.push(current);
        current = { startDate: dates[i].date, endDate: dates[i].date, detail: dates[i].detail, count: 1 };
      }
    }
    ranges.push(current);
    return ranges;
  };

  const hardGroups = groupByType(hardConflicts);
  const warnGroups = groupByType(warnings);
  const allGroups = { ...hardGroups, ...warnGroups };

  const visibleHardCount = hardConflicts.filter(c => !dismissed.has(`${c.type}-${c.entityId}`)).length;
  const visibleWarnCount = warnings.filter(c => !dismissed.has(`${c.type}-${c.entityId}`)).length;
  const dismissedCount = dismissed.size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto" data-testid="conflict-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Issues & Warnings
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {visibleHardCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {visibleHardCount} issue(s)
              </Badge>
            )}
            {visibleWarnCount > 0 && (
              <Badge variant="secondary">
                {visibleWarnCount} warning(s)
              </Badge>
            )}
            {dismissedCount > 0 && (
              <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                data-testid="toggle-show-dismissed"
              >
                {showDismissed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {dismissedCount} dismissed
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {Object.entries(allGroups).map(([type, items]) => {
            const config = CONFLICT_LABELS[type] || { label: type, color: "text-foreground" };
            const isExpanded = expandedSections[type] ?? false;
            const entities = groupByEntity(items);
            const isHard = type === "frac_under_supplied" || type === "hauler_over_capacity";

            const visibleEntities = entities.filter(e => !dismissed.has(`${type}-${e.entityId}`));
            const dismissedEntities = entities.filter(e => dismissed.has(`${type}-${e.entityId}`));
            const visibleCount = items.filter(c => !dismissed.has(`${type}-${c.entityId}`)).length;

            if (visibleEntities.length === 0 && !showDismissed) return null;

            return (
              <div key={type} className="border rounded-lg overflow-hidden" data-testid={`conflict-group-${type}`}>
                <div className="flex items-center">
                  <button
                    onClick={() => toggleSection(type)}
                    className="flex-1 flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                    data-testid={`toggle-conflict-${type}`}
                  >
                    <span className={`flex items-center gap-2 ${config.color}`}>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {isHard && <AlertTriangle className="w-3.5 h-3.5" />}
                      {config.label}
                    </span>
                    <Badge variant={isHard ? "destructive" : "secondary"} className="text-xs">
                      {visibleCount}
                    </Badge>
                  </button>
                  {visibleEntities.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); dismissAllOfType(type, entities.map(e => e.entityId)); }}
                      className="px-2 py-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Dismiss all"
                      data-testid={`dismiss-all-${type}`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t divide-y">
                    {visibleEntities.map((entity, i) => (
                      <div key={`visible-${entity.entityId}`} className="px-3 py-2" data-testid={`conflict-entity-${type}-${i}`}>
                        <div className="text-sm font-medium mb-1 flex items-center gap-1.5">
                          {type.startsWith("hauler") ? <Users className="w-3 h-3 text-muted-foreground" /> : <Truck className="w-3 h-3 text-muted-foreground" />}
                          <span className="flex-1">{entity.entityName}</span>
                          <button
                            onClick={() => dismissEntity(type, entity.entityId)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                            title="Dismiss"
                            data-testid={`dismiss-entity-${type}-${entity.entityId}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="space-y-0.5">
                          {collapseRanges(entity.dates).map((r, j) => (
                            <div key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="font-mono shrink-0 w-24">
                                {r.startDate === r.endDate
                                  ? formatDate(r.startDate)
                                  : `${formatDate(r.startDate)} - ${formatDate(r.endDate)}`}
                                {r.count > 1 && <span className="text-muted-foreground/60"> ({r.count}d)</span>}
                              </span>
                              <span>{r.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {showDismissed && dismissedEntities.map((entity) => (
                      <div key={`dismissed-${entity.entityId}`} className="px-3 py-2 opacity-50 bg-muted/20">
                        <div className="text-sm font-medium mb-1 flex items-center gap-1.5">
                          {type.startsWith("hauler") ? <Users className="w-3 h-3 text-muted-foreground" /> : <Truck className="w-3 h-3 text-muted-foreground" />}
                          <span className="flex-1 line-through">{entity.entityName}</span>
                          <button
                            onClick={() => restoreEntity(type, entity.entityId)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                            title="Restore"
                            data-testid={`restore-entity-${type}-${entity.entityId}`}
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {visibleHardCount === 0 && visibleWarnCount === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {dismissedCount > 0 ? "All issues dismissed" : "No issues or warnings found"}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Dashboard() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [selectedFracId, setSelectedFracId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [fracDialogOpen, setFracDialogOpen] = useState(false);
  const [laneSheetOpen, setLaneSheetOpen] = useState(false);
  const [laneDialogOpen, setLaneDialogOpen] = useState(false);
  const [editLane, setEditLane] = useState<Lane | null>(null);
  const [conflictSheetOpen, setConflictSheetOpen] = useState(false);
  const [ganttCollapsed, setGanttCollapsed] = useState(false);
  const [gridCollapsed, setGridCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
    };

    const onMouseUp = () => {
      isDraggingSplit.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [newJobForSchedule, setNewJobForSchedule] = useState<FracJob | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    startDate: "", endDate: "", requiredTrucksPerShift: 10, transitionDaysAfter: 2, status: "planned",
  });

  const { data: lanes = [], isLoading: lanesLoading } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });
  const { data: fracJobs = [], isLoading: fracLoading } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const { data: haulers = [] } = useQuery<Hauler[]>({ queryKey: ["/api/haulers"] });
  const { data: scenarios = [] } = useQuery<Scenario[]>({ queryKey: ["/api/scenarios"] });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: allocations = [] } = useQuery<AllocationBlock[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "allocations"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/allocations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch allocations");
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: conflicts = [] } = useQuery<Conflict[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "conflicts"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/conflicts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conflicts");
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: number; startDate: string; endDate: string }) => {
      return apiRequest("PATCH", `/api/schedules/${id}`, { plannedStartDate: startDate, plannedEndDate: endDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "conflicts"] });
      toast({ title: "Schedule updated" });
    },
  });

  const deleteLaneMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lanes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lanes"] });
      toast({ title: "Lane deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete lane", variant: "destructive" });
    },
  });

  const addScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId || !newJobForSchedule) return;
      return apiRequest("POST", "/api/schedules", {
        scenarioId: activeScenarioId,
        fracJobId: newJobForSchedule.id,
        plannedStartDate: scheduleForm.startDate,
        plannedEndDate: scheduleForm.endDate,
        requiredTrucksPerShift: scheduleForm.requiredTrucksPerShift,
        transitionDaysAfter: scheduleForm.transitionDaysAfter,
        status: scheduleForm.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "schedules"] });
      setScheduleDialogOpen(false);
      setNewJobForSchedule(null);
      toast({ title: "Job created and scheduled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add schedule", variant: "destructive" });
    },
  });

  const handleJobCreated = (job: FracJob) => {
    if (activeScenarioId) {
      setNewJobForSchedule(job);
      setScheduleForm({ startDate: "", endDate: "", requiredTrucksPerShift: 10, transitionDaysAfter: 2, status: "planned" });
      setScheduleDialogOpen(true);
      toast({ title: "Frac job created", description: "Now set the schedule dates" });
    } else {
      toast({ title: "Frac job created" });
    }
  };

  const activeScenario = scenarios.find(s => s.id === activeScenarioId);
  const isLocked = activeScenario?.locked || false;

  const hardConflicts = conflicts.filter(c => c.type === "frac_under_supplied" || c.type === "hauler_over_capacity");
  const warnings = conflicts.filter(c => c.type === "frac_over_supplied" || c.type === "hauler_split_warning");
  const uniqueHardDates = new Set(hardConflicts.map(c => c.date));
  const uniqueWarnDates = new Set(warnings.map(c => c.date));

  const selectedFrac = fracJobs.find(f => f.id === selectedFracId) || null;
  const selectedSchedule = schedules.find(s => s.fracJobId === selectedFracId) || null;

  const gridStartDate = useMemo(() => {
    const dateToUse = selectedDate || viewDate;
    if (dateToUse) return startOfDay(parseISO(dateToUse));
    return undefined;
  }, [selectedDate, viewDate]);

  const isLoading = lanesLoading || fracLoading || schedulesLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-semibold tracking-tight">Gantt Schedule</h1>
          <ScenarioSelector />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hardConflicts.length > 0 && (
            <Badge
              variant="destructive"
              className="gap-1 cursor-pointer hover:opacity-80"
              onClick={() => setConflictSheetOpen(true)}
              data-testid="badge-hard-conflicts"
            >
              <AlertTriangle className="w-3 h-3" />
              {uniqueHardDates.size} day(s) with issues
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:opacity-80"
              onClick={() => setConflictSheetOpen(true)}
              data-testid="badge-warnings"
            >
              {uniqueWarnDates.size} warning(s)
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLaneSheetOpen(true)}
            className="gap-1"
            data-testid="button-manage-lanes"
          >
            <Route className="w-3.5 h-3.5" />
            Lanes
          </Button>
          <Button
            size="sm"
            onClick={() => setFracDialogOpen(true)}
            className="gap-1"
            data-testid="button-add-job"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Job
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : lanes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">No lanes configured yet</p>
            <p className="text-sm text-muted-foreground">Create lanes and frac jobs to see the Gantt schedule</p>
          </div>
        </div>
      ) : (
        <div ref={splitContainerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            className="flex flex-col min-h-0 shrink-0 overflow-hidden"
            style={{
              height: ganttCollapsed ? "auto" :
                gridCollapsed ? "100%" :
                `${splitPercent}%`
            }}
          >
            <button
              onClick={() => setGanttCollapsed(!ganttCollapsed)}
              className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
              data-testid="toggle-gantt-section"
            >
              {ganttCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Gantt Schedule
            </button>
            {!ganttCollapsed && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <GanttChart
                  lanes={lanes}
                  fracJobs={fracJobs}
                  schedules={schedules}
                  conflicts={conflicts}
                  isLocked={isLocked}
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  onViewDateChange={setViewDate}
                  onScheduleUpdate={(id, start, end) => updateScheduleMutation.mutate({ id, startDate: start, endDate: end })}
                  onFracClick={(fracId) => {
                    setSelectedFracId(fracId);
                    setDetailOpen(true);
                  }}
                />
              </div>
            )}
          </div>

          {!ganttCollapsed && !gridCollapsed && (
            <div
              className="shrink-0 flex items-center justify-center cursor-row-resize group border-y border-border hover:bg-primary/5 transition-colors"
              style={{ height: 6 }}
              onMouseDown={handleSplitMouseDown}
              data-testid="split-handle"
            >
              <div className="w-12 h-1 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
            </div>
          )}

          <div
            className="flex flex-col min-h-0 shrink-0 overflow-hidden"
            style={{
              height: gridCollapsed ? "auto" :
                ganttCollapsed ? "100%" :
                `calc(${100 - splitPercent}% - 6px)`
            }}
          >
            <button
              onClick={() => setGridCollapsed(!gridCollapsed)}
              className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
              data-testid="toggle-grid-section"
            >
              {gridCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Allocation Grid
            </button>
            {!gridCollapsed && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <AllocationGridContent compact externalStartDate={gridStartDate} selectedDate={selectedDate} />
              </div>
            )}
          </div>
        </div>
      )}

      <FracDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        fracJob={selectedFrac}
        schedule={selectedSchedule}
        allocations={allocations}
        haulers={haulers}
      />

      <ConflictSheet
        open={conflictSheetOpen}
        onOpenChange={setConflictSheetOpen}
        hardConflicts={hardConflicts}
        warnings={warnings}
      />

      <FracJobDialog
        open={fracDialogOpen}
        onOpenChange={setFracDialogOpen}
        onCreated={handleJobCreated}
      />

      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => {
        setScheduleDialogOpen(open);
        if (!open) setNewJobForSchedule(null);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Schedule {newJobForSchedule?.padName || "Job"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set the start and end dates for this job in the active scenario.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={scheduleForm.startDate}
                  onChange={e => setScheduleForm(f => ({ ...f, startDate: e.target.value }))}
                  data-testid="input-sched-start"
                />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={scheduleForm.endDate}
                  onChange={e => setScheduleForm(f => ({ ...f, endDate: e.target.value }))}
                  data-testid="input-sched-end"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Trucks/Shift Required</Label>
                <Input
                  type="number"
                  value={scheduleForm.requiredTrucksPerShift}
                  onChange={e => setScheduleForm(f => ({ ...f, requiredTrucksPerShift: Number(e.target.value) }))}
                  data-testid="input-sched-trucks"
                />
              </div>
              <div className="space-y-1">
                <Label>Transition Days After</Label>
                <Input
                  type="number"
                  value={scheduleForm.transitionDaysAfter}
                  onChange={e => setScheduleForm(f => ({ ...f, transitionDaysAfter: Number(e.target.value) }))}
                  data-testid="input-sched-transition"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={scheduleForm.status}
                onValueChange={v => setScheduleForm(f => ({ ...f, status: v }))}
              >
                <SelectTrigger data-testid="select-sched-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setScheduleDialogOpen(false);
                setNewJobForSchedule(null);
                toast({ title: "Frac job created", description: "You can schedule it later from the Frac Jobs page" });
              }}
              data-testid="button-skip-schedule"
            >
              Skip
            </Button>
            <Button
              onClick={() => addScheduleMutation.mutate()}
              disabled={addScheduleMutation.isPending || !scheduleForm.startDate || !scheduleForm.endDate}
              data-testid="button-confirm-schedule"
            >
              {addScheduleMutation.isPending ? "Adding..." : "Add to Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={laneSheetOpen} onOpenChange={setLaneSheetOpen}>
        <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Manage Lanes</SheetTitle>
          </SheetHeader>
          <div className="space-y-2">
            {lanes.map(lane => (
              <div key={lane.id} className="flex items-center justify-between rounded-md border p-3" data-testid={`lane-row-${lane.id}`}>
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: lane.color }} />
                  <span className="text-sm font-medium">{lane.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setEditLane(lane); setLaneDialogOpen(true); }}
                    data-testid={`button-edit-lane-${lane.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => deleteLaneMutation.mutate(lane.id)}
                    data-testid={`button-delete-lane-${lane.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full gap-1 mt-2"
              onClick={() => { setEditLane(null); setLaneDialogOpen(true); }}
              data-testid="button-new-lane"
            >
              <Plus className="w-3.5 h-3.5" />
              New Lane
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <LaneDialog
        open={laneDialogOpen}
        onOpenChange={(open) => { setLaneDialogOpen(open); if (!open) setEditLane(null); }}
        editLane={editLane}
      />
    </div>
  );
}
