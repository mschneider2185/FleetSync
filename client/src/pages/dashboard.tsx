import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { GanttChart } from "@/components/gantt-chart";
import { FracDetailPanel } from "@/components/frac-detail-panel";
import { AllocationDialog } from "@/components/allocation-dialog";
import { ScenarioSelector } from "@/components/scenario-selector";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lane, FracJob, ScenarioFracSchedule, AllocationBlock, Hauler, Scenario } from "@shared/schema";

interface Conflict {
  type: string;
  date: string;
  entityId: number;
  entityName: string;
  detail: string;
}

export default function Dashboard() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [selectedFracId, setSelectedFracId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);

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

  const activeScenario = scenarios.find(s => s.id === activeScenarioId);
  const isLocked = activeScenario?.locked || false;

  const hardConflicts = conflicts.filter(c => c.type === "frac_under_supplied" || c.type === "hauler_over_capacity");
  const warnings = conflicts.filter(c => c.type === "frac_zero_buffer" || c.type === "frac_over_supplied" || c.type === "hauler_split_warning");
  const uniqueHardDates = new Set(hardConflicts.map(c => c.date));
  const uniqueWarnDates = new Set(warnings.map(c => c.date));

  const selectedFrac = fracJobs.find(f => f.id === selectedFracId) || null;
  const selectedSchedule = schedules.find(s => s.fracJobId === selectedFracId) || null;

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
            <Badge variant="destructive" className="gap-1" data-testid="badge-hard-conflicts">
              <AlertTriangle className="w-3 h-3" />
              {uniqueHardDates.size} day(s) with issues
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-warnings">
              {uniqueWarnDates.size} warning(s)
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllocDialogOpen(true)}
            className="gap-1"
            data-testid="button-add-allocation"
          >
            <Plus className="w-3.5 h-3.5" />
            Allocation
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
        <div className="flex-1 overflow-hidden">
          <GanttChart
            lanes={lanes}
            fracJobs={fracJobs}
            schedules={schedules}
            conflicts={conflicts}
            isLocked={isLocked}
            onScheduleUpdate={(id, start, end) => updateScheduleMutation.mutate({ id, startDate: start, endDate: end })}
            onFracClick={(fracId) => {
              setSelectedFracId(fracId);
              setDetailOpen(true);
            }}
          />
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

      <AllocationDialog
        open={allocDialogOpen}
        onOpenChange={setAllocDialogOpen}
      />
    </div>
  );
}
