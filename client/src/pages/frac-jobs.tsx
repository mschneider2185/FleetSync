import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { FracJobDialog } from "@/components/frac-job-dialog";
import { ScenarioSelector } from "@/components/scenario-selector";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, CalendarPlus, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { FracCloneDialog } from "@/components/frac-clone-dialog";
import type { Lane, FracJob, ScenarioFracSchedule, Scenario } from "@shared/schema";
import { getEffectiveScheduleStatus } from "@/lib/schedule-status";

export default function FracJobs() {
  const { activeScenarioId } = useScenario();
  const { data: scenarios = [] } = useQuery<Scenario[]>({ queryKey: ["/api/scenarios"] });
  const activeScenario = scenarios.find(s => s.id === activeScenarioId);
  const isSandbox = activeScenario?.type === "sandbox";
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editJob, setEditJob] = useState<FracJob | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneJob, setCloneJob] = useState<FracJob | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleFormFracId, setScheduleFormFracId] = useState<number | null>(null);
  const [editScheduleId, setEditScheduleId] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    startDate: "", endDate: "", requiredTrucksPerShift: 10, transitionDaysAfter: 2, status: "planned",
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    archived: true,
  });

  const { data: fracJobs = [], isLoading } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });
  const { data: schedules = [] } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const laneMap = new Map(lanes.map(l => [l.id, l]));
  const scheduleMap = new Map(schedules.map(s => [s.fracJobId, s]));

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      const url = isSandbox && activeScenarioId
        ? `/api/frac-jobs/${id}?scenarioId=${activeScenarioId}`
        : `/api/frac-jobs/${id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "schedules"] });
      toast({ title: isSandbox ? "Frac removed from sandbox" : "Frac job deleted" });
    },
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId || !scheduleFormFracId) return;
      if (editScheduleId) {
        return apiRequest("PATCH", `/api/schedules/${editScheduleId}`, {
          plannedStartDate: scheduleForm.startDate,
          plannedEndDate: scheduleForm.endDate,
          requiredTrucksPerShift: scheduleForm.requiredTrucksPerShift,
          transitionDaysAfter: scheduleForm.transitionDaysAfter,
          status: scheduleForm.status,
        });
      }
      return apiRequest("POST", "/api/schedules", {
        scenarioId: activeScenarioId,
        fracJobId: scheduleFormFracId,
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
      toast({ title: editScheduleId ? "Schedule updated" : "Schedule added to scenario" });
    },
  });

  const openAddSchedule = (fracId: number) => {
    setScheduleFormFracId(fracId);
    setEditScheduleId(null);
    setScheduleForm({ startDate: "", endDate: "", requiredTrucksPerShift: 10, transitionDaysAfter: 2, status: "planned" });
    setScheduleDialogOpen(true);
  };

  const openEditSchedule = (fracId: number, schedule: ScenarioFracSchedule) => {
    setScheduleFormFracId(fracId);
    setEditScheduleId(schedule.id);
    setScheduleForm({
      startDate: schedule.plannedStartDate,
      endDate: schedule.plannedEndDate,
      requiredTrucksPerShift: schedule.requiredTrucksPerShift,
      transitionDaysAfter: schedule.transitionDaysAfter,
      status: schedule.status,
    });
    setScheduleDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-semibold tracking-tight">Frac Jobs</h1>
          <ScenarioSelector />
        </div>
        <Button
          size="sm"
          onClick={() => { setEditJob(null); setDialogOpen(true); }}
          className="gap-1"
          data-testid="button-new-frac-job"
        >
          <Plus className="w-3.5 h-3.5" />
          New Frac Job
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : fracJobs.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-3">
              <p className="text-muted-foreground">No frac jobs yet</p>
              <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-frac">
                Create your first frac job
              </Button>
            </div>
          </div>
        ) : (() => {
          const activeJobs: FracJob[] = [];
          const plannedJobs: FracJob[] = [];
          const archivedJobs: FracJob[] = [];

          for (const job of fracJobs) {
            const schedule = scheduleMap.get(job.id);
            const effectiveStatus = schedule ? getEffectiveScheduleStatus(schedule) : null;
            if (effectiveStatus === "active") {
              activeJobs.push(job);
            } else if (effectiveStatus === "complete") {
              archivedJobs.push(job);
            } else {
              plannedJobs.push(job);
            }
          }

          const toggleSection = (key: string) => {
            setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
          };

          const sections = [
            { key: "active", label: "Active", jobs: activeJobs },
            { key: "planned", label: "Planned", jobs: plannedJobs },
            { key: "archived", label: "Archived / Completed", jobs: archivedJobs },
          ];

          const renderJobCard = (job: FracJob) => {
            const lane = laneMap.get(job.laneId);
            const schedule = scheduleMap.get(job.id);
            const effectiveStatus = schedule ? getEffectiveScheduleStatus(schedule) : null;
            const tonsPerDay = (job.stagesPerDay && job.tonsPerStage) ? job.stagesPerDay * job.tonsPerStage : null;

            return (
              <Card key={job.id} className="p-4" data-testid={`card-frac-${job.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {lane && (
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: lane.color }} />
                      )}
                      <span className="font-semibold text-base">{job.padName}</span>
                      <Badge variant="secondary" className="text-[10px]">{lane?.name || "No lane"}</Badge>
                      {schedule && (
                        <Badge
                          variant={effectiveStatus === "active" ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {effectiveStatus}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      {job.customer && <span>Customer: {job.customer}</span>}
                      {job.basin && <span>Basin: {job.basin}</span>}
                      {job.stagesPerDay && <span>{job.stagesPerDay} stg/day</span>}
                      {tonsPerDay && <span>{tonsPerDay.toLocaleString()} tons/day</span>}
                      {job.storageType && <span>{job.storageType} ({job.storageCapacity}t)</span>}
                      {job.travelTimeHours && <span>{job.travelTimeHours}hr travel</span>}
                    </div>
                    {schedule && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          Scheduled: {format(parseISO(schedule.plannedStartDate), "MMM d")} - {format(parseISO(schedule.plannedEndDate), "MMM d, yyyy")}
                          &ensp;&middot;&ensp;{schedule.requiredTrucksPerShift} trucks/shift
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => openEditSchedule(job.id, schedule)}
                          data-testid={`button-edit-schedule-${job.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!schedule && activeScenarioId && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openAddSchedule(job.id)}
                        data-testid={`button-schedule-${job.id}`}
                      >
                        <CalendarPlus className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setCloneJob(job); setCloneDialogOpen(true); }}
                      title="Clone frac job"
                      data-testid={`button-clone-frac-${job.id}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {!isSandbox && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditJob(job); setDialogOpen(true); }}
                        data-testid={`button-edit-frac-${job.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(job.id)}
                      title={isSandbox ? "Remove from sandbox" : "Delete frac job"}
                      data-testid={`button-delete-frac-${job.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          };

          return (
            <div className="space-y-4">
              {sections.map(({ key, label, jobs }) => (
                <div key={key} data-testid={`section-${key}`}>
                  <button
                    className="flex items-center gap-2 w-full text-left py-2 px-1 rounded-md hover-elevate"
                    onClick={() => toggleSection(key)}
                    data-testid={`button-toggle-${key}`}
                  >
                    {collapsedSections[key] ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-semibold text-sm">{label}</span>
                    <Badge variant="secondary" className="text-[10px]">{jobs.length}</Badge>
                  </button>
                  {!collapsedSections[key] && (
                    <div className="grid gap-3 mt-1">
                      {jobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-6 py-2">No frac jobs in this section</p>
                      ) : (
                        jobs.map(renderJobCard)
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <FracJobDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditJob(null); }}
        editJob={editJob}
      />

      <FracCloneDialog
        open={cloneDialogOpen}
        onOpenChange={(open) => { setCloneDialogOpen(open); if (!open) setCloneJob(null); }}
        sourceJob={cloneJob}
      />

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editScheduleId ? "Edit Schedule" : "Add to Scenario Schedule"}</DialogTitle>
          </DialogHeader>
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
          <DialogFooter>
            <Button
              onClick={() => saveScheduleMutation.mutate()}
              disabled={saveScheduleMutation.isPending}
              data-testid="button-confirm-schedule"
            >
              {saveScheduleMutation.isPending ? "Saving..." : editScheduleId ? "Update Schedule" : "Add Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
