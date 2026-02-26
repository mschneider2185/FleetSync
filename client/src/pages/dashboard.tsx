import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, AlertTriangle, Pencil, Trash2, Route } from "lucide-react";
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

export default function Dashboard() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [selectedFracId, setSelectedFracId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [fracDialogOpen, setFracDialogOpen] = useState(false);
  const [laneSheetOpen, setLaneSheetOpen] = useState(false);
  const [laneDialogOpen, setLaneDialogOpen] = useState(false);
  const [editLane, setEditLane] = useState<Lane | null>(null);
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
