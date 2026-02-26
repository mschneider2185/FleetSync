import { useForm } from "react-hook-form";
import { useEffect } from "react";
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
import type { Lane } from "@shared/schema";

const LANE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

const formSchema = z.object({
  name: z.string().min(1, "Lane name is required"),
  color: z.string().min(1, "Pick a color"),
  sortOrder: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LaneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editLane?: Lane | null;
}

function getDefaults(editLane?: Lane | null): FormValues {
  return {
    name: editLane?.name || "",
    color: editLane?.color || LANE_COLORS[0],
    sortOrder: editLane?.sortOrder ?? 0,
  };
}

export function LaneDialog({ open, onOpenChange, editLane }: LaneDialogProps) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaults(editLane),
  });

  useEffect(() => {
    if (open) {
      form.reset(getDefaults(editLane));
    }
  }, [open, editLane]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editLane) {
        return apiRequest("PATCH", `/api/lanes/${editLane.id}`, values);
      }
      return apiRequest("POST", "/api/lanes", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lanes"] });
      toast({ title: editLane ? "Lane updated" : "Lane created" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save lane", variant: "destructive" });
    },
  });

  const selectedColor = form.watch("color");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editLane ? "Edit Lane" : "Create Lane"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Lane Name</FormLabel>
                <FormControl><Input placeholder="e.g. Lane A" {...field} data-testid="input-lane-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <div className="flex gap-2 flex-wrap">
                  {LANE_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`w-7 h-7 rounded-md border-2 transition-all ${
                        selectedColor === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => field.onChange(c)}
                      data-testid={`color-swatch-${c.replace('#', '')}`}
                    />
                  ))}
                </div>
                <FormControl>
                  <Input type="color" {...field} className="h-8 w-20 mt-1" data-testid="input-lane-color" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="sortOrder" render={({ field }) => (
              <FormItem>
                <FormLabel>Sort Order</FormLabel>
                <FormControl><Input type="number" {...field} value={field.value ?? 0} data-testid="input-lane-sort" /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-lane">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-lane">
                {mutation.isPending ? "Saving..." : editLane ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
