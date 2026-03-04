import { format, parseISO } from "date-fns";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Copy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FracCloneDialog } from "@/components/frac-clone-dialog";
import type { FracJob, ScenarioFracSchedule, AllocationBlock, Hauler, FracDailyEvent } from "@shared/schema";

interface FracDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fracJob: FracJob | null;
  schedule: ScenarioFracSchedule | null;
  allocations: AllocationBlock[];
  haulers: Hauler[];
  scenarioId?: number;
}

interface TruckRecommendation {
  value: number;
  tonsPerDay: number;
  tonsPerShift: number;
  cycleTime: number;
  loadsPerShift: number;
  tonsPerTruckPerShift: number;
  loadUnloadTime: number;
}

const EVENT_CATEGORIES = [
  { value: "NPT", label: "NPT" },
  { value: "MECHANICAL", label: "Mechanical" },
  { value: "WEATHER", label: "Weather" },
  { value: "WATER_LIMITATION", label: "Water Limitation" },
  { value: "SAND_SUPPLY", label: "Sand Supply" },
  { value: "TRUCK_SHORTAGE", label: "Truck Shortage" },
  { value: "SWA", label: "Stop Work Authority" },
  { value: "OTHER", label: "Other" },
];

function computeRecommendedTrucks(fracJob: FracJob): TruckRecommendation | null {
  if (!fracJob.stagesPerDay || !fracJob.tonsPerStage) return null;
  if (!fracJob.avgTonsPerLoad || !fracJob.travelTimeHours) return null;

  const tonsPerDay = fracJob.stagesPerDay * fracJob.tonsPerStage;
  const tonsPerShift = tonsPerDay / 2;
  const loadUnloadTime = fracJob.loadUnloadTimeHours ?? 1.5;
  const cycleTime = fracJob.travelTimeHours + loadUnloadTime;
  const loadsPerShift = 12 / cycleTime;
  const tonsPerTruckPerShift = loadsPerShift * fracJob.avgTonsPerLoad;
  const recommended = tonsPerTruckPerShift > 0 ? Math.ceil(tonsPerShift / tonsPerTruckPerShift) : 0;

  return {
    value: recommended,
    tonsPerDay,
    tonsPerShift,
    cycleTime,
    loadsPerShift,
    tonsPerTruckPerShift,
    loadUnloadTime,
  };
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    NPT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    MECHANICAL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    WEATHER: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    WATER_LIMITATION: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    SAND_SUPPLY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    TRUCK_SHORTAGE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    SWA: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return colors[category] || colors.OTHER;
}

export function FracDetailPanel({ open, onOpenChange, fracJob, schedule, allocations, haulers, scenarioId }: FracDetailPanelProps) {
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  if (!fracJob) return null;

  const fracAllocations = allocations.filter(a => a.fracJobId === fracJob.id);
  const haulerMap = new Map(haulers.map(h => [h.id, h]));
  const recommendation = computeRecommendedTrucks(fracJob);

  const statusColor: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    planned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    complete: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            {fracJob.padName}
            {schedule && (
              <span className={`text-xs px-2 py-0.5 rounded-md ${statusColor[schedule.status] || ""}`}>
                {schedule.status}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 ml-auto"
              onClick={() => setCloneDialogOpen(true)}
              data-testid="button-clone-from-detail"
            >
              <Copy className="w-3.5 h-3.5" />
              Clone
            </Button>
          </SheetTitle>
          {fracJob.customer && (
            <p className="text-sm text-muted-foreground">{fracJob.customer} &middot; {fracJob.basin}</p>
          )}
        </SheetHeader>

        <Tabs defaultValue="sand-info">
          <TabsList className="w-full">
            <TabsTrigger value="sand-info" className="flex-1" data-testid="tab-sand-info">Sand Info</TabsTrigger>
            <TabsTrigger value="demand" className="flex-1" data-testid="tab-demand">Demand</TabsTrigger>
            <TabsTrigger value="assignments" className="flex-1" data-testid="tab-assignments">Haulers</TabsTrigger>
            <TabsTrigger value="journal" className="flex-1" data-testid="tab-journal">Journal</TabsTrigger>
          </TabsList>

          <TabsContent value="sand-info" className="space-y-4 pt-2">
            {schedule && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Start Date</p>
                    <p className="font-medium">{format(parseISO(schedule.plannedStartDate), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">End Date</p>
                    <p className="font-medium">{format(parseISO(schedule.plannedEndDate), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Transition Days After</p>
                    <p className="font-medium">{schedule.transitionDaysAfter} days</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Required Trucks/Shift</p>
                    <p className="font-medium">{schedule.requiredTrucksPerShift}</p>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Stages/Day</p>
                <p className="font-medium">{fracJob.stagesPerDay || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Tons/Stage</p>
                <p className="font-medium">{fracJob.tonsPerStage?.toLocaleString() || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Stages</p>
                <p className="font-medium">{fracJob.totalStages?.toLocaleString() || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Travel Time</p>
                <p className="font-medium">{fracJob.travelTimeHours ? `${fracJob.travelTimeHours} hrs` : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Avg Tons/Load</p>
                <p className="font-medium">{fracJob.avgTonsPerLoad || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Storage</p>
                <p className="font-medium">
                  {fracJob.storageType ? `${fracJob.storageType} (${fracJob.storageCapacity}t)` : "N/A"}
                </p>
              </div>
            </div>

            {fracJob.stagesPerDay && fracJob.tonsPerStage && (
              <>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Computed Demand</p>
                  <p className="font-medium">
                    {(fracJob.stagesPerDay * fracJob.tonsPerStage).toLocaleString()} tons/day
                  </p>
                  <p className="text-muted-foreground text-xs">
                    ({((fracJob.stagesPerDay * fracJob.tonsPerStage) / 2).toLocaleString()} tons/shift)
                  </p>
                </div>
              </>
            )}

            {fracJob.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{fracJob.notes}</p>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="demand" className="space-y-4 pt-2">
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Required Trucks/Shift (base)</p>
                <Badge variant="secondary" data-testid="badge-required-trucks">{schedule?.requiredTrucksPerShift || 0}</Badge>
              </div>

              {recommendation && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Recommended (Computed)</p>
                    <Badge variant="outline" data-testid="badge-recommended-trucks">{recommendation.value}</Badge>
                  </div>
                </div>
              )}
            </div>

            {schedule && scenarioId && (
              <TruckOverridesSection schedule={schedule} scenarioId={scenarioId} />
            )}

            {recommendation && (
              <div className="rounded-md border p-4 space-y-2">
                <p className="text-xs font-medium text-foreground mb-2">Calculation Breakdown</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Demand per day</span>
                    <span className="font-mono text-foreground" data-testid="text-tons-per-day">
                      {fracJob.stagesPerDay} stg × {fracJob.tonsPerStage} tons = {recommendation.tonsPerDay.toLocaleString()} tons/day
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Per 12-hr shift</span>
                    <span className="font-mono text-foreground" data-testid="text-tons-per-shift">
                      {recommendation.tonsPerShift.toLocaleString()} tons/shift
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-muted-foreground">
                    <span>Round-trip travel</span>
                    <span className="font-mono text-foreground">
                      {fracJob.travelTimeHours} hrs
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Load time</span>
                    <span className="font-mono text-foreground">
                      {recommendation.loadUnloadTime} hrs{!fracJob.loadUnloadTimeHours && " (default)"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Cycle time</span>
                    <span className="font-mono text-foreground" data-testid="text-cycle-time">
                      {fracJob.travelTimeHours} + {recommendation.loadUnloadTime} = {recommendation.cycleTime.toFixed(2)} hrs
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-muted-foreground">
                    <span>Loads per truck per shift</span>
                    <span className="font-mono text-foreground" data-testid="text-loads-per-shift">
                      12 / {recommendation.cycleTime.toFixed(2)} = {recommendation.loadsPerShift.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tons per truck per shift</span>
                    <span className="font-mono text-foreground" data-testid="text-tons-per-truck">
                      {recommendation.loadsPerShift.toFixed(2)} × {fracJob.avgTonsPerLoad} = {recommendation.tonsPerTruckPerShift.toFixed(1)} tons
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium text-foreground">
                    <span>Trucks needed</span>
                    <span className="font-mono" data-testid="text-trucks-needed">
                      ⌈{recommendation.tonsPerShift.toLocaleString()} / {recommendation.tonsPerTruckPerShift.toFixed(1)}⌉ = {recommendation.value}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!recommendation && (
              <div className="text-xs text-muted-foreground rounded-md border p-3">
                <p>Fill in stages/day, tons/stage, travel time, and avg tons/load on the frac job to see the computed recommendation.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="assignments" className="space-y-3 pt-2">
            {fracAllocations.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No haulers assigned to this frac yet
              </div>
            ) : (
              fracAllocations.map(alloc => {
                const hauler = haulerMap.get(alloc.haulerId);
                return (
                  <div key={alloc.id} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{hauler?.name || `Hauler #${alloc.haulerId}`}</p>
                      <Badge variant="secondary">{alloc.trucksPerShift} trucks/shift</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(alloc.startDate), "MMM d")} - {format(parseISO(alloc.endDate), "MMM d, yyyy")}
                    </p>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="journal" className="space-y-3 pt-2">
            <JournalTab fracJobId={fracJob.id} scenarioId={scenarioId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
    <FracCloneDialog
      open={cloneDialogOpen}
      onOpenChange={(open) => { setCloneDialogOpen(open); }}
      sourceJob={fracJob}
    />
    </>
  );
}

function TruckOverridesSection({ schedule, scenarioId }: { schedule: ScenarioFracSchedule; scenarioId: number }) {
  const { toast } = useToast();
  const [addingOverride, setAddingOverride] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideTrucks, setOverrideTrucks] = useState("");

  const overrides: Record<string, number> = schedule.truckRequirementOverrides
    ? (() => { try { return JSON.parse(schedule.truckRequirementOverrides); } catch { return {}; } })()
    : {};
  const sortedOverrides = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));

  const updateMutation = useMutation({
    mutationFn: async (newOverrides: Record<string, number>) => {
      const body = {
        truckRequirementOverrides: Object.keys(newOverrides).length > 0 ? JSON.stringify(newOverrides) : null,
      };
      await apiRequest("PATCH", `/api/schedules/${schedule.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "conflicts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAddOverride = () => {
    if (!overrideDate || overrideTrucks === "") return;
    if (overrideDate < schedule.plannedStartDate || overrideDate > schedule.plannedEndDate) {
      toast({ title: "Invalid date", description: "Override date must be within the schedule range", variant: "destructive" });
      return;
    }
    const parsed = parseInt(overrideTrucks);
    if (isNaN(parsed) || parsed < 0) {
      toast({ title: "Invalid value", description: "Enter a valid number of trucks", variant: "destructive" });
      return;
    }
    const newOverrides = { ...overrides, [overrideDate]: parsed };
    updateMutation.mutate(newOverrides);
    setOverrideDate("");
    setOverrideTrucks("");
    setAddingOverride(false);
  };

  const handleRemoveOverride = (dateKey: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateKey];
    updateMutation.mutate(newOverrides);
  };

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Truck Requirement Changes</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddingOverride(!addingOverride)}
          data-testid="button-add-truck-override"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Change
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes apply forward from their date. Base value ({schedule.requiredTrucksPerShift}) applies from {format(parseISO(schedule.plannedStartDate), "MMM d")}.
      </p>

      {addingOverride && (
        <div className="flex items-end gap-2 p-2 rounded bg-muted/50">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">From Date</label>
            <Input
              type="date"
              value={overrideDate}
              onChange={e => setOverrideDate(e.target.value)}
              min={schedule.plannedStartDate}
              max={schedule.plannedEndDate}
              data-testid="input-override-date"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground">Trucks</label>
            <Input
              type="number"
              value={overrideTrucks}
              onChange={e => setOverrideTrucks(e.target.value)}
              min="0"
              data-testid="input-override-trucks"
            />
          </div>
          <Button size="sm" onClick={handleAddOverride} disabled={updateMutation.isPending} data-testid="button-confirm-override">
            Save
          </Button>
        </div>
      )}

      {sortedOverrides.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No changes — base value applies for entire schedule.</p>
      ) : (
        <div className="space-y-1">
          {sortedOverrides.map(([date, trucks]) => (
            <div key={date} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/50">
              <span>
                <span className="font-mono text-xs">{format(parseISO(date), "MMM d, yyyy")}</span>
                <span className="mx-2 text-muted-foreground">&rarr;</span>
                <span className="font-medium">{trucks} trucks/shift</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleRemoveOverride(date)}
                data-testid={`button-remove-override-${date}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JournalTab({ fracJobId, scenarioId }: { fracJobId: number; scenarioId?: number }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newCategory, setNewCategory] = useState("");
  const [newHoursLost, setNewHoursLost] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: events = [], isLoading } = useQuery<FracDailyEvent[]>({
    queryKey: ["/api/frac-jobs", fracJobId, "events", scenarioId],
    queryFn: async () => {
      if (!scenarioId) return [];
      const res = await fetch(`/api/frac-jobs/${fracJobId}/events?scenarioId=${scenarioId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!scenarioId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        scenarioId,
        date: newDate,
        category: newCategory,
        notes: newNotes || undefined,
      };
      if (newHoursLost) body.hoursLost = parseFloat(newHoursLost);
      const res = await apiRequest("POST", `/api/frac-jobs/${fracJobId}/events`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs", fracJobId, "events", scenarioId] });
      setShowAdd(false);
      setNewCategory("");
      setNewHoursLost("");
      setNewNotes("");
      toast({ title: "Journal entry added" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs", fracJobId, "events", scenarioId] });
      toast({ title: "Journal entry deleted" });
    },
  });

  if (!scenarioId) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Select a scenario to view journal entries
      </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Daily Log ({events.length})</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setShowAdd(!showAdd)}
          data-testid="button-add-journal"
        >
          <Plus className="w-3 h-3" />
          Add Entry
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Date</p>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                data-testid="input-journal-date"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Category</p>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger data-testid="select-journal-category">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Hours Lost (optional)</p>
            <Input
              type="number"
              step="0.5"
              placeholder="e.g., 4"
              value={newHoursLost}
              onChange={(e) => setNewHoursLost(e.target.value)}
              data-testid="input-journal-hours"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <Textarea
              placeholder="What happened..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              data-testid="input-journal-notes"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!newCategory || !newDate || createMutation.isPending}
              data-testid="button-save-journal"
            >
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground text-center py-4">Loading...</div>}

      {!isLoading && sortedEvents.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No journal entries yet
        </div>
      )}

      {sortedEvents.map(event => (
        <div key={event.id} className="rounded-md border p-3 space-y-1" data-testid={`journal-entry-${event.id}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {format(parseISO(event.date), "MMM d")}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${getCategoryColor(event.category)}`}>
                {EVENT_CATEGORIES.find(c => c.value === event.category)?.label || event.category}
              </span>
              {event.hoursLost && (
                <span className="text-xs text-muted-foreground">{event.hoursLost}h lost</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(event.id)}
              data-testid={`button-delete-journal-${event.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
          {event.notes && (
            <p className="text-xs text-muted-foreground">{event.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}
