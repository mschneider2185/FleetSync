import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { HaulerDialog } from "@/components/hauler-dialog";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Split } from "lucide-react";
import type { Hauler, AllocationBlock, ScenarioFracSchedule } from "@shared/schema";

const CAPACITY_DAYS = 14;

export default function Haulers() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editHauler, setEditHauler] = useState<Hauler | null>(null);
  const [capacityStartDate, setCapacityStartDate] = useState(() => startOfDay(new Date()));

  const { data: haulers = [], isLoading } = useQuery<Hauler[]>({ queryKey: ["/api/haulers"] });

  const { data: allocations = [] } = useQuery<AllocationBlock[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "allocations"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/allocations`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: schedules = [] } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const completedFracJobIds = useMemo(() => {
    return new Set(schedules.filter(s => s.status === "complete").map(s => s.fracJobId));
  }, [schedules]);

  const activeAllocations = useMemo(() => {
    return allocations.filter(a => !completedFracJobIds.has(a.fracJobId));
  }, [allocations, completedFracJobIds]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/haulers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/haulers"] });
      toast({ title: "Hauler deleted" });
    },
  });

  const capacityDates = useMemo(() =>
    Array.from({ length: CAPACITY_DAYS }, (_, i) => addDays(capacityStartDate, i)),
    [capacityStartDate]
  );

  const getHaulerTotalForDay = (haulerId: number, dateStr: string) => {
    const relevant = activeAllocations.filter(
      a => a.haulerId === haulerId && a.startDate <= dateStr && a.endDate >= dateStr
    );
    let dayTotal = 0;
    let nightTotal = 0;
    for (const a of relevant) {
      if (a.shift === "day") {
        dayTotal += a.trucksPerShift;
      } else if (a.shift === "night") {
        nightTotal += a.trucksPerShift;
      } else {
        dayTotal += a.trucksPerShift;
        nightTotal += a.trucksPerShift;
      }
    }
    return Math.max(dayTotal, nightTotal);
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background">
        <h1 className="text-lg font-semibold tracking-tight">Haulers</h1>
        <Button
          size="sm"
          onClick={() => { setEditHauler(null); setDialogOpen(true); }}
          className="gap-1"
          data-testid="button-new-hauler"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Hauler
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="list" className="h-full flex flex-col">
          <div className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="list" data-testid="tab-hauler-list">Hauler List</TabsTrigger>
              <TabsTrigger value="capacity" data-testid="tab-hauler-capacity">Capacity View</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="list" className="flex-1 overflow-auto p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : haulers.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center space-y-3">
                  <p className="text-muted-foreground">No haulers configured</p>
                  <Button onClick={() => setDialogOpen(true)} data-testid="button-create-first-hauler">
                    Add your first hauler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {haulers.map(hauler => {
                  const totalAssignedToday = getHaulerTotalForDay(hauler.id, today);
                  return (
                    <Card key={hauler.id} className="p-4" data-testid={`card-hauler-${hauler.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{hauler.name}</span>
                            {hauler.splitAllowed && (
                              <Badge variant="secondary" className="text-[10px] gap-1">
                                <Split className="w-3 h-3" />
                                Split OK
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>Max: {hauler.defaultMaxTrucksPerShift}/shift</span>
                            <span>Min commit: {hauler.defaultMinCommittedTrucksPerShift}/shift</span>
                            {hauler.homeArea && <span>Home: {hauler.homeArea}</span>}
                            <span>Today: {totalAssignedToday} assigned</span>
                          </div>
                          {hauler.notes && (
                            <p className="text-xs text-muted-foreground truncate">{hauler.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditHauler(hauler); setDialogOpen(true); }}
                            data-testid={`button-edit-hauler-${hauler.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(hauler.id)}
                            data-testid={`button-delete-hauler-${hauler.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="capacity" className="flex-1 overflow-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={() => setCapacityStartDate(d => addDays(d, -7))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCapacityStartDate(startOfDay(new Date()))}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCapacityStartDate(d => addDays(d, 7))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="overflow-auto">
              <table className="w-max border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    <th className="sticky left-0 z-20 bg-background border-b border-r px-3 py-2 text-left font-medium text-muted-foreground min-w-[140px]">
                      Hauler
                    </th>
                    <th className="border-b border-r px-2 py-2 text-center font-medium text-muted-foreground w-14">Max</th>
                    <th className="border-b border-r px-2 py-2 text-center font-medium text-muted-foreground w-14">Min</th>
                    {capacityDates.map((date, i) => {
                      const ds = format(date, "yyyy-MM-dd");
                      const isToday = ds === today;
                      return (
                        <th
                          key={i}
                          className={`border-b border-r px-1 py-1 text-center font-normal w-12 ${
                            isToday ? "bg-primary/5 font-semibold text-primary" : "text-muted-foreground"
                          }`}
                        >
                          <div className="text-[10px]">{format(date, "EEE")}</div>
                          <div>{format(date, "M/d")}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {haulers.map(hauler => (
                    <tr key={hauler.id}>
                      <td className="sticky left-0 z-10 bg-background border-b border-r px-3 py-2 font-medium">
                        {hauler.name}
                      </td>
                      <td className="border-b border-r text-center py-1 text-muted-foreground">
                        {hauler.defaultMaxTrucksPerShift}
                      </td>
                      <td className="border-b border-r text-center py-1 text-muted-foreground">
                        {hauler.defaultMinCommittedTrucksPerShift}
                      </td>
                      {capacityDates.map((date, i) => {
                        const ds = format(date, "yyyy-MM-dd");
                        const assigned = getHaulerTotalForDay(hauler.id, ds);
                        const isOver = assigned > hauler.defaultMaxTrucksPerShift;
                        const isUnderCommit = assigned < hauler.defaultMinCommittedTrucksPerShift;
                        return (
                          <td
                            key={i}
                            className={`border-b border-r text-center py-1 font-medium ${
                              isOver ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400" :
                              isUnderCommit && assigned > 0 ? "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400" :
                              assigned > 0 ? "text-foreground" : "text-muted-foreground/50"
                            }`}
                          >
                            {assigned > 0 ? assigned : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <HaulerDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditHauler(null); }}
        editHauler={editHauler}
      />
    </div>
  );
}
