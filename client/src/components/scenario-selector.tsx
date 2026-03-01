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
import { Copy, Lock, FlaskConical } from "lucide-react";
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
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");

  const { data: scenarios = [], isLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: roleData } = useQuery<{ isPlanner: boolean }>({
    queryKey: ["/api/auth/role"],
  });
  const isPlannerUser = roleData?.isPlanner ?? true;

  useEffect(() => {
    if (!activeScenarioId && scenarios.length > 0) {
      const forecast = scenarios.find(s => s.type === "forecast");
      if (forecast) setActiveScenarioId(forecast.id);
      else setActiveScenarioId(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId, setActiveScenarioId]);

  const sandboxMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      const res = await apiRequest("POST", `/api/scenarios/${activeScenarioId}/create-sandbox`, {
        name: sandboxName || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      if (data?.id) setActiveScenarioId(data.id);
      setSandboxDialogOpen(false);
      setSandboxName("");
      toast({ title: "Sandbox created", description: "You can now make changes without affecting the original plan." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      const res = await apiRequest("POST", `/api/scenarios/${activeScenarioId}/clone`, {
        name: cloneName || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      if (data?.id) setActiveScenarioId(data.id);
      setCloneDialogOpen(false);
      setCloneName("");
      toast({ title: "Scenario cloned" });
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

      {isPlannerUser && (
        <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1" data-testid="button-clone-scenario">
              <Copy className="w-3.5 h-3.5" />
              Clone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clone {activeScenario?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Clone Name</Label>
                <Input
                  placeholder={`${activeScenario?.name} (Copy)`}
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  data-testid="input-clone-name"
                />
              </div>
              <Button
                onClick={() => cloneMutation.mutate()}
                disabled={cloneMutation.isPending}
                className="w-full"
                data-testid="button-confirm-clone"
              >
                {cloneMutation.isPending ? "Cloning..." : "Clone Scenario"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
