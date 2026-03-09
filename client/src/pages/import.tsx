import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ScenarioSelector } from "@/components/scenario-selector";
import { useScenario } from "@/hooks/use-scenario";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Scenario } from "@shared/schema";

interface ImportSummary {
  rows: number;
  createdFracs: number;
  updatedFracs: number;
  createdSchedules: number;
  updatedSchedules: number;
  skippedRows: number;
  warnings: string[];
}

interface ImportResponse {
  ok: boolean;
  scenarioId: number;
  summary: ImportSummary;
}

export default function ImportPage() {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [lastResult, setLastResult] = useState<ImportResponse | null>(null);

  const { data: scenarios = [] } = useQuery<Scenario[]>({ queryKey: ["/api/scenarios"] });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file first");
      const url =
        activeScenarioId != null
          ? `/api/import/sandplan?scenarioId=${activeScenarioId}`
          : "/api/import/sandplan";
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json() as Promise<ImportResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/frac-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lanes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", data.scenarioId, "schedules"] });
      setLastResult(data);
      const hasWarnings = data.summary.warnings?.length;
      toast({
        title: "Import complete",
        description: hasWarnings
          ? `${data.summary.rows} rows processed. Check warnings below.`
          : undefined,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">Sand Planning import</h1>
        <ScenarioSelector />
      </div>

      <div className="p-4 space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Import Sand Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import into{" "}
              {activeScenarioId != null
                ? scenarios.find((s) => s.id === activeScenarioId)?.name ?? "selected scenario"
                : "default Baseline (created if missing)"}
              . Upload your Sand Planning sheet as a CSV or Excel (.xlsx) file.
            </p>
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV / Excel file</Label>
              <input
                id="csv-file"
                data-testid="input-file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFile(f ?? null);
                  setLastResult(null);
                }}
              />
            </div>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!file || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </CardContent>
        </Card>

        {lastResult && (
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Rows processed</dt>
                <dd>{lastResult.summary.rows}</dd>
                <dt className="text-muted-foreground">Frac jobs created</dt>
                <dd>{lastResult.summary.createdFracs}</dd>
                <dt className="text-muted-foreground">Frac jobs updated</dt>
                <dd>{lastResult.summary.updatedFracs}</dd>
                <dt className="text-muted-foreground">Schedules created</dt>
                <dd>{lastResult.summary.createdSchedules}</dd>
                <dt className="text-muted-foreground">Schedules updated</dt>
                <dd>{lastResult.summary.updatedSchedules}</dd>
                <dt className="text-muted-foreground">Rows skipped</dt>
                <dd>{lastResult.summary.skippedRows}</dd>
              </dl>
              {lastResult.summary.warnings && lastResult.summary.warnings.length > 0 && (
                <Alert variant="default">
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {lastResult.summary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
