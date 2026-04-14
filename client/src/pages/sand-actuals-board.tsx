import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import type { FactFracDayActual } from "@shared/schema";

type DateType = "calendar" | "operational";

interface BoardResponse {
  dateType: DateType;
  date: string;
  rows: FactFracDayActual[];
}

interface SyncResponse {
  syncRunId: number;
  status: "succeeded" | "partial" | "failed";
  rowsRead: number;
  rowsWritten: number;
  rowsUpdated: number;
  rowsSkipped: number;
  attributionsWritten: number;
  factRowsRebuilt: number;
  window: { from: string | null; to: string | null };
  source: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: string | number | null, digits = 0): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function SandActualsBoardPage() {
  const { toast } = useToast();
  const [dateType, setDateType] = useState<DateType>("calendar");
  const [date, setDate] = useState<string>(todayIso());

  const { data: role } = useQuery<{ isPlanner: boolean }>({
    queryKey: ["/api/auth/role"],
  });

  const boardKey = useMemo(
    () => ["/api/actuals/sand-board", dateType, date] as const,
    [dateType, date],
  );

  const { data, isLoading, isError, error } = useQuery<BoardResponse>({
    queryKey: boardKey,
    queryFn: async () => {
      const params = new URLSearchParams({ dateType, date });
      const res = await fetch(`/api/actuals/sand-board?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
  });

  const syncMutation = useMutation<SyncResponse>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync/sand-tickets", {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/actuals/sand-board"] });
      toast({
        title: `Sync ${result.status}`,
        description: `Read ${result.rowsRead} · wrote ${result.rowsWritten} · updated ${result.rowsUpdated} · fact rows ${result.factRowsRebuilt}`,
      });
    },
    onError: (err) => {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const rows = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto" data-testid="page-sand-actuals-board">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Report date type
          </label>
          <Select value={dateType} onValueChange={(v) => setDateType(v as DateType)}>
            <SelectTrigger className="w-[180px]" data-testid="select-date-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar">Calendar date</SelectItem>
              <SelectItem value="operational">Operational day</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Date
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[180px]"
            data-testid="input-board-date"
          />
        </div>

        <div className="ml-auto">
          {role?.isPlanner && (
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-run-sync"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`}
              />
              {syncMutation.isPending ? "Syncing…" : "Run sync"}
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">
            Failed to load board: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No attributed loads for {data?.dateType === "operational" ? "operational day" : "calendar date"}{" "}
            <span className="font-medium">{data?.date}</span>. Run a sync or pick a different date.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dev run</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Loads</TableHead>
                <TableHead className="text-right">Tons</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Day / Night</TableHead>
                <TableHead className="text-right">Trucks</TableHead>
                <TableHead className="text-right">Core 2+ / 3+</TableHead>
                <TableHead className="text-right">Avg field cycle (h)</TableHead>
                <TableHead className="text-right">Cost / ton</TableHead>
                <TableHead>Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid={`row-fact-${row.id}`}>
                  <TableCell className="font-medium">{row.devRunName}</TableCell>
                  <TableCell>{row.siteName ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.deliveredLoadCount)}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.deliveredTons, 1)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.deliveredTotalCost)}</TableCell>
                  <TableCell className="text-right">
                    {row.dayLoadCount} / {row.nightLoadCount}
                  </TableCell>
                  <TableCell className="text-right">{row.participatingTruckCount}</TableCell>
                  <TableCell className="text-right">
                    {row.coreTruckCount2Plus} / {row.coreTruckCount3Plus}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(row.avgFieldCycleHours, 2)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.costPerTon)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.attributionMethod}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
