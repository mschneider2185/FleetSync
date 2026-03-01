import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Lane, FracJob, Preset } from "@shared/schema";

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
});

type FormValues = z.infer<typeof formSchema>;

interface FracJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editJob?: FracJob | null;
  onCreated?: (job: FracJob) => void;
}

function getDefaults(editJob?: FracJob | null): FormValues {
  return {
    padName: editJob?.padName || "",
    laneId: editJob?.laneId || 0,
    customer: editJob?.customer || "",
    basin: editJob?.basin || "",
    notes: editJob?.notes || "",
    stagesPerDay: editJob?.stagesPerDay ?? undefined,
    tonsPerStage: editJob?.tonsPerStage ?? undefined,
    totalStages: editJob?.totalStages ?? undefined,
    travelTimeHours: editJob?.travelTimeHours ?? undefined,
    avgTonsPerLoad: editJob?.avgTonsPerLoad ?? undefined,
    loadUnloadTimeHours: editJob?.loadUnloadTimeHours ?? undefined,
    storageType: editJob?.storageType || "",
    storageCapacity: editJob?.storageCapacity ?? undefined,
  };
}

export function FracJobDialog({ open, onOpenChange, editJob, onCreated }: FracJobDialogProps) {
  const { toast } = useToast();
  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });
  const { data: allPresets = [] } = useQuery<Preset[]>({ queryKey: ["/api/presets"] });

  const storagePresets = allPresets.filter(p => p.presetType === "storage");
  const sandDesignPresets = allPresets.filter(p => p.presetType === "sand_design");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaults(editJob),
  });

  useEffect(() => {
    if (open) {
      form.reset(getDefaults(editJob));
    }
  }, [open, editJob]);

  const applyPreset = (preset: Preset) => {
    try {
      const data = JSON.parse(preset.data);
      for (const [key, value] of Object.entries(data)) {
        if (key in formSchema.shape) {
          form.setValue(key as keyof FormValues, value as any, { shouldDirty: true });
        }
      }
      toast({ title: "Preset applied", description: `Applied "${preset.name}"` });
    } catch {
      toast({ title: "Error", description: "Failed to apply preset", variant: "destructive" });
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editJob) {
        return apiRequest("PATCH", `/api/frac-jobs/${editJob.id}`, values);
      }
      return apiRequest("POST", "/api/frac-jobs", values);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs"] });
      if (!editJob && onCreated) {
        try {
          const newJob = await response.json();
          onCreated(newJob);
        } catch {
          toast({ title: "Frac job created" });
        }
      } else {
        toast({ title: editJob ? "Frac job updated" : "Frac job created" });
      }
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save frac job", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editJob ? "Edit Frac Job" : "Create Frac Job"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="padName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Pad Name</FormLabel>
                  <FormControl><Input placeholder="e.g. BIG177" {...field} data-testid="input-pad-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="laneId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lane</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-lane">
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
                  <FormControl><Input placeholder="e.g. COP" {...field} data-testid="input-customer" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="basin" render={({ field }) => (
                <FormItem>
                  <FormLabel>Basin / Area</FormLabel>
                  <FormControl><Input placeholder="e.g. Permian" {...field} data-testid="input-basin" /></FormControl>
                </FormItem>
              )} />
            </div>

            {(storagePresets.length > 0 || sandDesignPresets.length > 0) && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Quick Presets</p>
                <div className="grid grid-cols-2 gap-4">
                  {storagePresets.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Storage Preset</p>
                      <Select onValueChange={(val) => {
                        if (val === "__clear__") return;
                        const preset = storagePresets.find(p => p.id.toString() === val);
                        if (preset) applyPreset(preset);
                      }}>
                        <SelectTrigger data-testid="select-storage-preset">
                          <SelectValue placeholder="Select preset..." />
                        </SelectTrigger>
                        <SelectContent>
                          {storagePresets.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()} data-testid={`preset-storage-${p.id}`}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sandDesignPresets.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Sand Design Preset</p>
                      <Select onValueChange={(val) => {
                        if (val === "__clear__") return;
                        const preset = sandDesignPresets.find(p => p.id.toString() === val);
                        if (preset) applyPreset(preset);
                      }}>
                        <SelectTrigger data-testid="select-sand-preset">
                          <SelectValue placeholder="Select preset..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sandDesignPresets.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()} data-testid={`preset-sand-${p.id}`}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Sand Plan</p>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="stagesPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stages/Day</FormLabel>
                    <FormControl><Input type="number" step="any" {...field} value={field.value ?? ""} data-testid="input-stages-per-day" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tonsPerStage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tons/Stage</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} data-testid="input-tons-per-stage" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalStages" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Stages</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} data-testid="input-total-stages" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="travelTimeHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Travel Time (hrs)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ""} data-testid="input-travel-time" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="avgTonsPerLoad" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avg Tons/Load</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ""} data-testid="input-avg-tons" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="loadUnloadTimeHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Load+Unload Time (hrs)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ""} data-testid="input-load-unload-time" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="storageType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-storage-type">
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
                <FormField control={form.control} name="storageCapacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage Capacity (tons)</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} data-testid="input-storage-capacity" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="POs, contacts, etc." {...field} data-testid="input-notes" /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-frac">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-frac">
                {mutation.isPending ? "Saving..." : editJob ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
