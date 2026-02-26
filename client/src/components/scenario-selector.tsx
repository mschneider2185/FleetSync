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
import { Copy, Lock, Plus } from "lucide-react";
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

export function ScenarioSelector() {
  const { activeScenarioId, setActiveScenarioId } = useScenario();
  const { toast } = useToast();
  const [sandboxName, setSandboxName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: scenarios = [], isLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  useEffect(() => {
    if (!activeScenarioId && scenarios.length > 0) {
      const forecast = scenarios.find(s => s.type === "forecast");
      if (forecast) setActiveScenarioId(forecast.id);
      else setActiveScenarioId(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId, setActiveScenarioId]);

  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      const res = await apiRequest("POST", `/api/scenarios/${activeScenarioId}/clone`, {
        name: sandboxName || undefined,
        type: "sandbox",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      if (data?.id) setActiveScenarioId(data.id);
      setDialogOpen(false);
      setSandboxName("");
      toast({ title: "Sandbox created", description: "You can now make changes without affecting the original plan." });
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
                <Badge variant={getTypeBadgeVariant(s.type)} className="text-[10px] ml-1">
                  {s.type}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1" data-testid="button-create-sandbox">
            <Copy className="w-3.5 h-3.5" />
            Sandbox
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sandbox from {activeScenario?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Sandbox Name</Label>
              <Input
                placeholder="e.g., What-if Mingo delays 3 days"
                value={sandboxName}
                onChange={(e) => setSandboxName(e.target.value)}
                data-testid="input-sandbox-name"
              />
            </div>
            <Button
              onClick={() => cloneMutation.mutate()}
              disabled={cloneMutation.isPending}
              className="w-full"
              data-testid="button-confirm-sandbox"
            >
              {cloneMutation.isPending ? "Creating..." : "Create Sandbox"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
