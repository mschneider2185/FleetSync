import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useScenario } from "@/hooks/use-scenario";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Lane, FracJob } from "@shared/schema";

const formSchema = z.object({
  padName: z.string().min(1, "Pad name is required"),
  laneId: z.coerce.number().min(1, "Select a lane"),
  customer: z.string().optional(),
  basin: z.string().optional(),
  notes: z.string().optional(),
  stagesPerDay: z.coerce.number().min(0).optional(),
  tonsPerStage: z.coerce.number().min(0).optional(),
  totalStages: z.coerce.number().min(0).optional(),
  travelTimeHours: z.coerce.number().min(0).optional(),
  avgTonsPerLoad: z.coerce.number().min(0).optional(),
  loadUnloadTimeHours: z.coerce.number().min(0).optional(),
  storageType: z.string().optional(),
  storageCapacity: z.coerce.number().min(0).optional(),
  schedStartDate: z.string().optional().default(""),
  schedEndDate: z.string().optional().default(""),
  schedTrucksPerShift: z.coerce.number().min(0).default(10),
  schedTransitionDays: z.coerce.number().min(0).default(2),
  schedStatus: z.string().default("planned"),
});

type FormValues = z.infer<typeof formSchema>;

interface FracCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceJob: FracJob | null;
}

function getDefaults(source: FracJob | null): FormValues {
  return {
    padName: source ? `${source.padName} (Copy)` : "",
    laneId: source?.laneId || 0,
    customer: source?.customer || "",
    basin: source?.basin || "",
    notes: source?.notes || "",
    stagesPerDay: source?.stagesPerDay ?? undefined,
    tonsPerStage: source?.tonsPerStage ?? undefined,
    totalStages: source?.totalStages ?? undefined,
    travelTimeHours: source?.travelTimeHours ?? undefined,
    avgTonsPerLoad: source?.avgTonsPerLoad ?? undefined,
    loadUnloadTimeHours: source?.loadUnloadTimeHours ?? undefined,
    storageType: source?.storageType || "",
    storageCapacity: source?.storageCapacity ?? undefined,
    schedStartDate: "",
    schedEndDate: "",
    schedTrucksPerShift: 10,
    schedTransitionDays: 2,
    schedStatus: "planned",
  };
}

export function FracCloneDialog({ open, onOpenChange, sourceJob }: FracCloneDialogProps) {
  const { toast } = useToast();
  const { activeScenarioId } = useScenario();
  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaults(sourceJob),
  });

  useEffect(() => {
    if (open && sourceJob) {
      form.reset(getDefaults(sourceJob));
    }
  }, [open, sourceJob]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const fracBody = {
        padName: values.padName,
        laneId: values.laneId,
        customer: values.customer,
        basin: values.basin,
        notes: values.notes,
        stagesPerDay: values.stagesPerDay,
        tonsPerStage: values.tonsPerStage,
        totalStages: values.totalStages,
        travelTimeHours: values.travelTimeHours,
        avgTonsPerLoad: values.avgTonsPerLoad,
        loadUnloadTimeHours: values.loadUnloadTimeHours,
        storageType: values.storageType,
        storageCapacity: values.storageCapacity,
      };
      const fracRes = await apiRequest("POST", "/api/frac-jobs", fracBody);
      const newFrac = await fracRes.json();

      if (activeScenarioId && values.schedStartDate && values.schedEndDate) {
        await apiRequest("POST", "/api/schedules", {
          scenarioId: activeScenarioId,
          fracJobId: newFrac.id,
          plannedStartDate: values.schedStartDate,
          plannedEndDate: values.schedEndDate,
          requiredTrucksPerShift: values.schedTrucksPerShift,
          transitionDaysAfter: values.schedTransitionDays,
          status: values.schedStatus,
        });
      }

      return newFrac;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs"] });
      if (activeScenarioId) {
        queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "schedules"] });
      }
      toast({ title: "Frac job cloned", description: `Created ${form.getValues("padName")} with schedule` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clone Frac Job: {sourceJob?.padName}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="padName" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Pad Name</FormLabel>
                  <FormControl><Input placeholder="e.g. BIG177-B" {...field} data-testid="input-clone-pad-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="laneId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lane</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-clone-lane">
                        <SelectValue placeholder="Select lane" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {lanes.map(l => (
                        <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customer" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <FormControl><Input {...field} data-testid="input-clone-customer" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="basin" render={({ field }) => (
                <FormItem>
                  <FormLabel>Basin / Area</FormLabel>
                  <FormControl><Input {...field} data-testid="input-clone-basin" /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Sand Plan</p>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="stagesPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stages/Day</FormLabel>
                    <FormControl><Input type="number" step="any" {...field} value={field.value ?? ""} data-testid="input-clone-stages" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tonsPerStage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tons/Stage</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} data-testid="input-clone-tons" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalStages" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Stages</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} data-testid="input-clone-total-stages" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="travelTimeHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Travel Time (hrs)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ""} data-testid="input-clone-travel" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="avgTonsPerLoad" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avg Tons/Load</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ""} data-testid="input-clone-avg-tons" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="storageType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-clone-storage">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="silo">Silo</SelectItem>
                        <SelectItem value="kube">Kube</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Schedule (in active scenario)</p>
              {!activeScenarioId ? (
                <p className="text-sm text-muted-foreground">Select a scenario to add a schedule</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="schedStartDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl><Input type="date" {...field} data-testid="input-clone-sched-start" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="schedEndDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl><Input type="date" {...field} data-testid="input-clone-sched-end" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="schedTrucksPerShift" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trucks/Shift Required</FormLabel>
                      <FormControl><Input type="number" {...field} data-testid="input-clone-sched-trucks" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="schedTransitionDays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transition Days After</FormLabel>
                      <FormControl><Input type="number" {...field} data-testid="input-clone-sched-transition" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="schedStatus" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-clone-sched-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="POs, contacts, etc." {...field} data-testid="input-clone-notes" /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-clone-frac">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-confirm-clone-frac">
                {mutation.isPending ? "Creating..." : "Clone & Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
