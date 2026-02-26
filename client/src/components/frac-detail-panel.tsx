import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { FracJob, ScenarioFracSchedule, AllocationBlock, Hauler } from "@shared/schema";

interface FracDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fracJob: FracJob | null;
  schedule: ScenarioFracSchedule | null;
  allocations: AllocationBlock[];
  haulers: Hauler[];
}

interface TruckRecommendation {
  value: number;
  tonsPerDay: number;
  tonsPerShift: number;
  cycleTime: number;
  loadsPerShift: number;
  tonsPerTruckPerShift: number;
}

function computeRecommendedTrucks(fracJob: FracJob): TruckRecommendation | null {
  if (!fracJob.stagesPerDay || !fracJob.tonsPerStage) return null;
  if (!fracJob.avgTonsPerLoad || !fracJob.travelTimeHours) return null;

  const tonsPerDay = fracJob.stagesPerDay * fracJob.tonsPerStage;
  const tonsPerShift = tonsPerDay / 2;
  const loadUnloadTime = 1.5;
  const cycleTime = fracJob.travelTimeHours * 2 + loadUnloadTime;
  const loadsPerShift = 12 / cycleTime;
  const tonsPerTruckPerShift = loadsPerShift * fracJob.avgTonsPerLoad;
  const recommended = Math.ceil(tonsPerShift / tonsPerTruckPerShift);

  return {
    value: recommended,
    tonsPerDay,
    tonsPerShift,
    cycleTime,
    loadsPerShift,
    tonsPerTruckPerShift,
  };
}

export function FracDetailPanel({ open, onOpenChange, fracJob, schedule, allocations, haulers }: FracDetailPanelProps) {
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
                <p className="text-sm font-medium">Required Trucks/Shift (set)</p>
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
                      {fracJob.travelTimeHours} × 2 = {(fracJob.travelTimeHours! * 2).toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Load + unload time</span>
                    <span className="font-mono text-foreground">1.5 hrs</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Cycle time</span>
                    <span className="font-mono text-foreground" data-testid="text-cycle-time">
                      {recommendation.cycleTime.toFixed(1)} hrs
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-muted-foreground">
                    <span>Loads per truck per shift</span>
                    <span className="font-mono text-foreground" data-testid="text-loads-per-shift">
                      12 / {recommendation.cycleTime.toFixed(1)} = {recommendation.loadsPerShift.toFixed(2)}
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
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
