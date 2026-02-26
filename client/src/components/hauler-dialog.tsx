import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Hauler } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  splitAllowed: z.boolean().default(false),
  homeArea: z.string().optional(),
  notes: z.string().optional(),
  defaultMaxTrucksPerShift: z.coerce.number().min(1),
  defaultMinCommittedTrucksPerShift: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

interface HaulerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editHauler?: Hauler | null;
}

export function HaulerDialog({ open, onOpenChange, editHauler }: HaulerDialogProps) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: editHauler?.name || "",
      splitAllowed: editHauler?.splitAllowed || false,
      homeArea: editHauler?.homeArea || "",
      notes: editHauler?.notes || "",
      defaultMaxTrucksPerShift: editHauler?.defaultMaxTrucksPerShift || 10,
      defaultMinCommittedTrucksPerShift: editHauler?.defaultMinCommittedTrucksPerShift || 0,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editHauler) {
        return apiRequest("PATCH", `/api/haulers/${editHauler.id}`, values);
      }
      return apiRequest("POST", "/api/haulers", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/haulers"] });
      toast({ title: editHauler ? "Hauler updated" : "Hauler created" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save hauler", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editHauler ? "Edit Hauler" : "Add Hauler"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Hauler Name</FormLabel>
                <FormControl><Input placeholder="e.g. ET" {...field} data-testid="input-hauler-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="defaultMaxTrucksPerShift" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Trucks/Shift</FormLabel>
                  <FormControl><Input type="number" {...field} data-testid="input-max-trucks" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="defaultMinCommittedTrucksPerShift" render={({ field }) => (
                <FormItem>
                  <FormLabel>Min Committed/Shift</FormLabel>
                  <FormControl><Input type="number" {...field} data-testid="input-min-committed" /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="homeArea" render={({ field }) => (
              <FormItem>
                <FormLabel>Home Area / Yard</FormLabel>
                <FormControl><Input placeholder="e.g. Midland" {...field} data-testid="input-home-area" /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="splitAllowed" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3">
                <FormLabel className="mb-0">Allow Split (multiple fracs)</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-split-allowed" />
                </FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Additional notes..." {...field} data-testid="input-hauler-notes" /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-hauler">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-hauler">
                {mutation.isPending ? "Saving..." : editHauler ? "Update" : "Add Hauler"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
