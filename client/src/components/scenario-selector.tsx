import { useQuery, useMutation } from "@tanstack/react-query";
import { useScenario } from "@/hooks/use-scenario";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, FlaskConical } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Scenario } from "@shared/schema";

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case "baseline": return "secondary";
    case "forecast": return "default";
    case "actual": return "outline";
    case "sandbox": return "secondary";
    default: return "secondary";
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "baseline": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "forecast": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "actual": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "sandbox": return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    default: return "";
  }
}

export function ScenarioSelector() {
  const { activeScenarioId, setActiveScenarioId } = useScenario();
  const { toast } = useToast();
  const [sandboxName, setSandboxName] = useState("");
  const [sandboxDialogOpen, setSandboxDialogOpen] = useState(false);
  const [blankCanvas, setBlankCanvas] = useState(false);

  const { data: scenarios = [], isLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  useEffect(() => {
    if (!activeScenarioId && scenarios.length > 0) {
      const primary = scenarios.find(s => s.type === "actual") || scenarios.find(s => s.type === "forecast");
      if (primary) setActiveScenarioId(primary.id);
      else setActiveScenarioId(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId, setActiveScenarioId]);

  const sandboxMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      const res = await apiRequest("POST", `/api/scenarios/${activeScenarioId}/create-sandbox`, {
        name: sandboxName || undefined,
        blank: blankCanvas,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      if (data?.id) setActiveScenarioId(data.id);
      setSandboxDialogOpen(false);
      setSandboxName("");
      setBlankCanvas(false);
      toast({
        title: "Sandbox created",
        description: blankCanvas
          ? "Starting from scratch — add frac jobs and schedules to build your plan."
          : "You can now make changes without affecting the original plan.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activeScenario = scenarios.find(s => s.id === activeScenarioId);

  if (isLoading) {
    return <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={activeScenarioId?.toString() || ""}
        onValueChange={(val) => setActiveScenarioId(Number(val))}
      >
        <SelectTrigger className="w-56" data-testid="select-scenario">
          <SelectValue placeholder="Select scenario" />
        </SelectTrigger>
        <SelectContent>
          {scenarios.map((s) => (
            <SelectItem key={s.id} value={s.id.toString()} data-testid={`select-scenario-${s.id}`}>
              <span className="flex items-center gap-2">
                {s.locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                {s.name}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTypeColor(s.type)}`}>
                  {s.type}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeScenario && (
        <Badge variant={getTypeBadgeVariant(activeScenario.type)} className="text-xs" data-testid="badge-scenario-type">
          {activeScenario.type.toUpperCase()}
          {activeScenario.locked && " (locked)"}
        </Badge>
      )}

      <Dialog open={sandboxDialogOpen} onOpenChange={setSandboxDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1" data-testid="button-create-sandbox">
            <FlaskConical className="w-3.5 h-3.5" />
            Sandbox
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sandbox from {activeScenario?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Sandbox Name (optional)</Label>
              <Input
                placeholder="e.g., What-if Mingo delays 3 days"
                value={sandboxName}
                onChange={(e) => setSandboxName(e.target.value)}
                data-testid="input-sandbox-name"
              />
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="blank-canvas"
                checked={blankCanvas}
                onCheckedChange={(checked) => setBlankCanvas(checked === true)}
                data-testid="checkbox-blank-canvas"
              />
              <div className="space-y-1">
                <Label htmlFor="blank-canvas" className="cursor-pointer font-medium leading-none">
                  Start from scratch
                </Label>
                <p className="text-xs text-muted-foreground">
                  Create an empty sandbox with no schedules or allocations. You'll build your plan from the ground up.
                </p>
              </div>
            </div>
            <Button
              onClick={() => sandboxMutation.mutate()}
              disabled={sandboxMutation.isPending}
              className="w-full"
              data-testid="button-confirm-sandbox"
            >
              {sandboxMutation.isPending ? "Creating..." : "Create Sandbox"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
