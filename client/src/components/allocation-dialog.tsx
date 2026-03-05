import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useScenario } from "@/hooks/use-scenario";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import type { FracJob, Hauler, AllocationBlock } from "@shared/schema";

const formSchema = z.object({
  fracJobId: z.coerce.number().min(1, "Select a frac job"),
  haulerId: z.coerce.number().min(1, "Select a hauler"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  trucksPerShift: z.coerce.number().min(1, "Must assign at least 1 truck"),
});

type FormValues = z.infer<typeof formSchema>;

interface AllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAllocation?: AllocationBlock | null;
  defaultFracJobId?: number;
  defaultHaulerId?: number;
}

export function AllocationDialog({ open, onOpenChange, editAllocation, defaultFracJobId, defaultHaulerId }: AllocationDialogProps) {
  const { toast } = useToast();
  const { activeScenarioId } = useScenario();
  const { data: fracJobs = [] } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const { data: haulers = [] } = useQuery<Hauler[]>({ queryKey: ["/api/haulers"] });
  const [capacityWarning, setCapacityWarning] = useState<{
    message: string;
    action: () => void;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fracJobId: editAllocation?.fracJobId || defaultFracJobId || 0,
      haulerId: editAllocation?.haulerId || defaultHaulerId || 0,
      startDate: editAllocation?.startDate || "",
      endDate: editAllocation?.endDate || "",
      trucksPerShift: editAllocation?.trucksPerShift || 1,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        fracJobId: editAllocation?.fracJobId || defaultFracJobId || 0,
        haulerId: editAllocation?.haulerId || defaultHaulerId || 0,
        startDate: editAllocation?.startDate || "",
        endDate: editAllocation?.endDate || "",
        trucksPerShift: editAllocation?.trucksPerShift || 1,
      });
    }
  }, [open, editAllocation, defaultFracJobId, defaultHaulerId]);

  const submitAllocation = async (values: FormValues, force?: boolean) => {
    const payload = { ...values, scenarioId: activeScenarioId, force };
    const url = editAllocation
      ? `/api/allocations/${editAllocation.id}`
      : "/api/allocations";
    const method = editAllocation ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });

    if (res.status === 422) {
      const body = await res.json();
      if (body.requiresConfirmation) {
        setCapacityWarning({
          message: body.message,
          action: () => mutation.mutate({ ...values, _force: true } as any),
        });
        return null;
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res;
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues & { _force?: boolean }) => {
      const { _force, ...formValues } = values;
      return submitAllocation(formValues, _force);
    },
    onSuccess: (data) => {
      if (data === null) return;
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "allocations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "conflicts"] });
      toast({ title: editAllocation ? "Allocation updated" : "Allocation created" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save allocation", variant: "destructive" });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editAllocation ? "Edit Allocation" : "Add Allocation"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="fracJobId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frac Job</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-alloc-frac">
                        <SelectValue placeholder="Select frac" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fracJobs.map(f => (
                        <SelectItem key={f.id} value={f.id.toString()}>{f.padName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="haulerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hauler</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-alloc-hauler">
                        <SelectValue placeholder="Select hauler" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {haulers.map(h => (
                        <SelectItem key={h.id} value={h.id.toString()}>{h.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-alloc-start" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-alloc-end" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="trucksPerShift" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trucks/Shift</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} data-testid="input-alloc-trucks" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-alloc">
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save-alloc">
                  {mutation.isPending ? "Saving..." : editAllocation ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!capacityWarning} onOpenChange={(open) => { if (!open) setCapacityWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Hauler Over Capacity
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {capacityWarning?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-capacity">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-accept-capacity"
              className="bg-amber-600"
              onClick={() => {
                capacityWarning?.action();
                setCapacityWarning(null);
              }}
            >
              Accept Over-Capacity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
