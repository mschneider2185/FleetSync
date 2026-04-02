import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { format, addDays, startOfDay, startOfWeek, startOfMonth, startOfQuarter } from "date-fns";
import { ScenarioSelector } from "@/components/scenario-selector";
import { AllocationDialog } from "@/components/allocation-dialog";
import { useScenario } from "@/hooks/use-scenario";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Download, AlertTriangle, Pencil, X, Check, Trash2 } from "lucide-react";
import type { Lane, FracJob, ScenarioFracSchedule, AllocationBlock, Hauler, Scenario } from "@shared/schema";
import { getEffectiveTrucksForDate } from "@shared/schema";

const COL_WIDTH = 56;
const LABEL_WIDTH = 220;
const DEFAULT_DAYS_VISIBLE = 21;
const STATUS_SORT_ORDER: Record<string, number> = { active: 0, planned: 1, paused: 2, complete: 3 };

interface EditingCell {
  fracJobId: number;
  haulerId: number;
  dateStr: string;
  allocId: number | null;
  originalValue: number;
  shift: "day" | "night";
}

interface RangeSelection {
  fracJobId: number;
  haulerId: number;
  startDateStr: string;
  endDateStr: string;
  shift: "day" | "night";
}

interface DragFill {
  fracJobId: number;
  haulerId: number;
  sourceDateStr: string;
  sourceValue: number;
  currentDateStr: string;
  shift: "day" | "night";
}

interface AllocationGridContentProps {
  compact?: boolean;
  externalStartDate?: Date;
  externalDaysVisible?: number;
  selectedDate?: string | null;
  onDateSelect?: (dateStr: string) => void;
  outerScrollRef?: RefObject<HTMLDivElement>;
  showTotals?: boolean;
}

export function AllocationGridContent({
  compact = false,
  externalStartDate,
  externalDaysVisible,
  selectedDate: selectedDateProp,
  onDateSelect,
  outerScrollRef,
  showTotals,
}: AllocationGridContentProps) {
  const { activeScenarioId } = useScenario();
  const { toast } = useToast();
  const [internalStartDate, setInternalStartDate] = useState(() => startOfDay(new Date()));
  const startDate = externalStartDate || internalStartDate;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [presetDays, setPresetDays] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const isStandalone = !externalStartDate;
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [totalsExpanded, setTotalsExpanded] = useState(false);
  const [surplusExpanded, setSurplusExpanded] = useState(false);
  const [expandedFracDn, setExpandedFracDn] = useState<Set<number>>(new Set());

  const toggleFracDn = (fracJobId: number) => {
    setExpandedFracDn(prev => {
      const next = new Set(prev);
      next.has(fracJobId) ? next.delete(fracJobId) : next.add(fracJobId);
      return next;
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const autoDays = useMemo(() => {
    if (containerWidth <= 0) return DEFAULT_DAYS_VISIBLE;
    return Math.max(7, Math.floor((containerWidth - LABEL_WIDTH) / COL_WIDTH));
  }, [containerWidth]);

  const daysVisible = externalDaysVisible || presetDays || autoDays;

  const applyPreset = (key: string, days: number) => {
    const now = new Date();
    let snapDate: Date;
    switch (key) {
      case "1W":
        snapDate = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case "2W":
        snapDate = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case "1M":
        snapDate = startOfMonth(now);
        break;
      case "Q":
        snapDate = startOfQuarter(now);
        break;
      default:
        snapDate = startOfDay(now);
    }
    setInternalStartDate(snapDate);
    setPresetDays(days);
    setActivePreset(key);
  };

  const clearPreset = () => {
    setPresetDays(null);
    setActivePreset(null);
  };

  const navigateToDate = (date: Date) => {
    clearPreset();
    const nextDate = startOfDay(date);
    if (externalStartDate) {
      onDateSelect?.(format(nextDate, "yyyy-MM-dd"));
      return;
    }
    setInternalStartDate(nextDate);
  };

  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [allocDialogFrac, setAllocDialogFrac] = useState<number | undefined>();
  const [allocDialogHauler, setAllocDialogHauler] = useState<number | undefined>();
  const [allocDialogEdit, setAllocDialogEdit] = useState<AllocationBlock | null>(null);
  const [haulerToDelete, setHaulerToDelete] = useState<{ fracJobId: number; haulerId: number } | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);
  const [capacityWarning, setCapacityWarning] = useState<{
    message: string;
    action: () => void;
  } | null>(null);

  const [rangeSelection, setRangeSelection] = useState<RangeSelection | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const bulkToolbarRef = useRef<HTMLDivElement>(null);

  const [dragFill, setDragFill] = useState<DragFill | null>(null);
  const isDraggingRef = useRef(false);

  const { data: lanes = [] } = useQuery<Lane[]>({ queryKey: ["/api/lanes"] });
  const { data: fracJobs = [] } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const { data: haulers = [] } = useQuery<Hauler[]>({ queryKey: ["/api/haulers"] });
  const { data: scenarios = [] } = useQuery<Scenario[]>({ queryKey: ["/api/scenarios"] });

  const { data: schedules = [], isLoading } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: allocations = [] } = useQuery<AllocationBlock[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "allocations"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/allocations`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const dates = useMemo(() =>
    Array.from({ length: daysVisible }, (_, i) => addDays(startDate, i)),
    [startDate, daysVisible]
  );
  const dateStrings = useMemo(() => dates.map(d => format(d, "yyyy-MM-dd")), [dates]);

  const fracMap = useMemo(() => new Map(fracJobs.map(f => [f.id, f])), [fracJobs]);
  const fracJobIds = useMemo(() => new Set(fracJobs.map(f => f.id)), [fracJobs]);
  const haulerMap = useMemo(() => new Map(haulers.map(h => [h.id, h])), [haulers]);
  const laneMap = useMemo(() => new Map(lanes.map(l => [l.id, l])), [lanes]);

  const validSchedules = useMemo(() => schedules.filter(s => fracJobIds.has(s.fracJobId)), [schedules, fracJobIds]);

  const activeSchedules = useMemo(() => {
    const endDateStr = format(addDays(startDate, daysVisible), "yyyy-MM-dd");
    const startDateStr = format(startDate, "yyyy-MM-dd");
    return validSchedules
      .filter(s => s.plannedEndDate >= startDateStr && s.plannedStartDate <= endDateStr)
      .sort((a, b) => (STATUS_SORT_ORDER[a.status ?? "planned"] ?? 99) - (STATUS_SORT_ORDER[b.status ?? "planned"] ?? 99));
  }, [validSchedules, startDate, daysVisible]);

  const getAllocForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string) => {
    return allocations.find(a =>
      a.fracJobId === fracJobId && a.haulerId === haulerId &&
      a.startDate <= dateStr && a.endDate >= dateStr
    ) || null;
  }, [allocations]);

  const getShiftAllocForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    const specific = allocations.find(a =>
      a.fracJobId === fracJobId && a.haulerId === haulerId &&
      a.startDate <= dateStr && a.endDate >= dateStr && a.shift === shift
    );
    if (specific) return specific;
    return allocations.find(a =>
      a.fracJobId === fracJobId && a.haulerId === haulerId &&
      a.startDate <= dateStr && a.endDate >= dateStr && (a.shift === "both" || !a.shift)
    ) || null;
  }, [allocations]);

  const getShiftTrucksForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    const alloc = getShiftAllocForDay(fracJobId, haulerId, dateStr, shift);
    return alloc ? alloc.trucksPerShift : 0;
  }, [getShiftAllocForDay]);

  const getTrucksForDay = useCallback((fracJobId: number, haulerId: number, dateStr: string) => {
    const alloc = getAllocForDay(fracJobId, haulerId, dateStr);
    return alloc ? alloc.trucksPerShift : 0;
  }, [getAllocForDay]);

  const getTotalForFracDay = useCallback((fracJobId: number, dateStr: string) => {
    return allocations
      .filter(a => a.fracJobId === fracJobId && a.startDate <= dateStr && a.endDate >= dateStr)
      .reduce((sum, a) => sum + a.trucksPerShift, 0);
  }, [allocations]);

  const getShiftTotalForFracDay = useCallback((fracJobId: number, dateStr: string, shift: "day" | "night") => {
    return allocations
      .filter(a => a.fracJobId === fracJobId && a.startDate <= dateStr && a.endDate >= dateStr &&
        (a.shift === shift || a.shift === "both" || !a.shift))
      .reduce((sum, a) => sum + a.trucksPerShift, 0);
  }, [allocations]);

  const getCellColor = (assigned: number, required: number) => {
    if (required === 0) return "";
    if (assigned === 0) return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400";
    const deviation = Math.abs(assigned - required);
    if (deviation === 0) return "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400";
    if (deviation === 1) return "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400";
    return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400";
  };

  const isSchedActiveOnDate = (schedule: ScenarioFracSchedule, dateStr: string) => {
    return schedule.plannedStartDate <= dateStr && schedule.plannedEndDate >= dateStr;
  };

  const today = format(new Date(), "yyyy-MM-dd");

  const allocRequest = async (method: string, url: string, data: any, forceRetry: () => void) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (res.status === 422) {
      const body = await res.json();
      if (body.requiresConfirmation) {
        setCapacityWarning({ message: body.message, action: forceRetry });
        return null;
      }
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res;
  };

  const refreshAllocations = async () => {
    await queryClient.refetchQueries({ queryKey: ["/api/scenarios", activeScenarioId, "allocations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/scenarios", activeScenarioId, "conflicts"] });
  };

  const updateAllocMutation = useMutation({
    mutationFn: async ({ allocId, trucksPerShift, force }: { allocId: number; trucksPerShift: number; force?: boolean }) => {
      return allocRequest("PATCH", `/api/allocations/${allocId}`, { trucksPerShift, force }, () => {
        updateAllocMutation.mutate({ allocId, trucksPerShift, force: true });
      });
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update allocation", variant: "destructive" });
    },
  });

  const createAllocMutation = useMutation({
    mutationFn: async (payload: { fracJobId: number; haulerId: number; startDate: string; endDate: string; trucksPerShift: number; scenarioId: number; shift?: string; force?: boolean }) => {
      return allocRequest("POST", "/api/allocations", payload, () => {
        createAllocMutation.mutate({ ...payload, force: true });
      });
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create allocation", variant: "destructive" });
    },
  });

  const deleteAllocMutation = useMutation({
    mutationFn: async (allocId: number) => {
      return apiRequest("DELETE", `/api/allocations/${allocId}`);
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete allocation", variant: "destructive" });
    },
  });

  const deleteHaulerFromFracMutation = useMutation({
    mutationFn: async ({ fracJobId, haulerId }: { fracJobId: number; haulerId: number }) => {
      const toDelete = allocations.filter(a => a.fracJobId === fracJobId && a.haulerId === haulerId);
      for (const alloc of toDelete) {
        await apiRequest("DELETE", `/api/allocations/${alloc.id}`);
      }
    },
    onSettled: refreshAllocations,
    onSuccess: () => {
      toast({ title: "Hauler removed from frac job" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove hauler", variant: "destructive" });
    },
  });

  const splitAndEditMutation = useMutation({
    mutationFn: async ({ alloc, dateStr, newValue, shift }: { alloc: AllocationBlock; dateStr: string; newValue: number; shift: "day" | "night" }) => {
      const prevDay = format(addDays(new Date(dateStr + "T00:00:00"), -1), "yyyy-MM-dd");
      const nextDay = format(addDays(new Date(dateStr + "T00:00:00"), 1), "yyyy-MM-dd");
      const allocShift = alloc.shift ?? "both";

      await apiRequest("DELETE", `/api/allocations/${alloc.id}`);

      if (alloc.startDate < dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
          startDate: alloc.startDate, endDate: prevDay, trucksPerShift: alloc.trucksPerShift,
          shift: allocShift, force: true,
        });
      }

      await apiRequest("POST", "/api/allocations", {
        scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
        startDate: dateStr, endDate: dateStr, trucksPerShift: newValue,
        shift, force: true,
      });

      if (alloc.endDate > dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
          startDate: nextDay, endDate: alloc.endDate, trucksPerShift: alloc.trucksPerShift,
          shift: allocShift, force: true,
        });
      }
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update allocation", variant: "destructive" });
    },
  });

  const splitBothAndEditMutation = useMutation({
    mutationFn: async ({ alloc, dateStr, newValue, shift }: { alloc: AllocationBlock; dateStr: string; newValue: number; shift: "day" | "night" }) => {
      const otherShift: "day" | "night" = shift === "day" ? "night" : "day";
      const originalValue = alloc.trucksPerShift;
      const prevDay = format(addDays(new Date(dateStr + "T00:00:00"), -1), "yyyy-MM-dd");
      const nextDay = format(addDays(new Date(dateStr + "T00:00:00"), 1), "yyyy-MM-dd");

      await apiRequest("DELETE", `/api/allocations/${alloc.id}`);

      if (alloc.startDate < dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
          startDate: alloc.startDate, endDate: prevDay, trucksPerShift: originalValue,
          shift: "both", force: true,
        });
      }
      if (alloc.endDate > dateStr) {
        await apiRequest("POST", "/api/allocations", {
          scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
          startDate: nextDay, endDate: alloc.endDate, trucksPerShift: originalValue,
          shift: "both", force: true,
        });
      }
      await apiRequest("POST", "/api/allocations", {
        scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
        startDate: dateStr, endDate: dateStr, trucksPerShift: newValue, shift, force: true,
      });
      await apiRequest("POST", "/api/allocations", {
        scenarioId: alloc.scenarioId, fracJobId: alloc.fracJobId, haulerId: alloc.haulerId,
        startDate: dateStr, endDate: dateStr, trucksPerShift: originalValue, shift: otherShift, force: true,
      });
    },
    onSettled: refreshAllocations,
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update allocation", variant: "destructive" });
    },
  });

  const bulkAllocMutation = useMutation({
    mutationFn: async (payload: { fracJobId: number; haulerId: number; startDate: string; endDate: string; trucksPerShift: number; scenarioId: number; shift?: string; force?: boolean; setZero?: boolean }) => {
      return allocRequest("POST", "/api/allocations/bulk", payload, () => {
        bulkAllocMutation.mutate({ ...payload, force: true });
      });
    },
    onSettled: refreshAllocations,
    onSuccess: () => {
      setRangeSelection(null);
      setBulkValue("");
      setDragFill(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to apply bulk edit", variant: "destructive" });
    },
  });

  const startEditing = (fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    if (isSavingRef.current) return;
    if (isDraggingRef.current) return;
    const alloc = getShiftAllocForDay(fracJobId, haulerId, dateStr, shift);
    const currentValue = alloc ? alloc.trucksPerShift : 0;
    setEditingCell({
      fracJobId,
      haulerId,
      dateStr,
      allocId: alloc?.id || null,
      originalValue: currentValue,
      shift,
    });
    setEditValue(alloc ? currentValue.toString() : "");
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const commitEdit = useCallback(() => {
    if (isSavingRef.current || !editingCell || !activeScenarioId) return;
    isSavingRef.current = true;

    const newValue = parseInt(editValue) || 0;
    const cell = editingCell;
    const shift = cell.shift;

    setEditingCell(null);
    setEditValue("");

    const resetGuard = () => { isSavingRef.current = false; };

    if (newValue === cell.originalValue) {
      resetGuard();
      return;
    }

    try {
      const exactShiftAlloc = allocations.find(a =>
        a.fracJobId === cell.fracJobId && a.haulerId === cell.haulerId &&
        a.startDate <= cell.dateStr && a.endDate >= cell.dateStr && a.shift === shift
      );
      const bothAlloc = allocations.find(a =>
        a.fracJobId === cell.fracJobId && a.haulerId === cell.haulerId &&
        a.startDate <= cell.dateStr && a.endDate >= cell.dateStr && (a.shift === "both" || !a.shift)
      );

      if (exactShiftAlloc) {
        if (exactShiftAlloc.startDate < cell.dateStr || exactShiftAlloc.endDate > cell.dateStr) {
          splitAndEditMutation.mutate({ alloc: exactShiftAlloc, dateStr: cell.dateStr, newValue, shift }, { onSettled: resetGuard });
        } else {
          updateAllocMutation.mutate({ allocId: exactShiftAlloc.id, trucksPerShift: newValue }, { onSettled: resetGuard });
        }
      } else if (bothAlloc) {
        splitBothAndEditMutation.mutate({ alloc: bothAlloc, dateStr: cell.dateStr, newValue, shift }, { onSettled: resetGuard });
      } else if (editValue !== "") {
        createAllocMutation.mutate({
          fracJobId: cell.fracJobId,
          haulerId: cell.haulerId,
          startDate: cell.dateStr,
          endDate: cell.dateStr,
          trucksPerShift: newValue,
          scenarioId: activeScenarioId,
          shift,
        }, { onSettled: resetGuard });
      } else {
        resetGuard();
      }
    } catch {
      resetGuard();
    }
  }, [editingCell, editValue, activeScenarioId, allocations, splitAndEditMutation, splitBothAndEditMutation, updateAllocMutation, createAllocMutation]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      requestAnimationFrame(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      });
    }
  }, [editingCell]);

  const handleShiftCellClick = (fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night", e: React.MouseEvent) => {
    if (isDraggingRef.current) return;

    if (e.shiftKey && rangeSelection && rangeSelection.fracJobId === fracJobId && rangeSelection.haulerId === haulerId && rangeSelection.shift === shift) {
      const start = rangeSelection.startDateStr;
      const newEnd = dateStr;
      const orderedStart = start <= newEnd ? start : newEnd;
      const orderedEnd = start <= newEnd ? newEnd : start;
      setRangeSelection({ fracJobId, haulerId, startDateStr: orderedStart, endDateStr: orderedEnd, shift });
      return;
    }

    setRangeSelection({ fracJobId, haulerId, startDateStr: dateStr, endDateStr: dateStr, shift });
    setBulkValue("");
  };

  const handleShiftCellDoubleClick = (fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    if (isDraggingRef.current) return;
    setRangeSelection(null);
    setBulkValue("");
    startEditing(fracJobId, haulerId, dateStr, shift);
  };

  const isInRange = (fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    if (!rangeSelection) return false;
    return rangeSelection.fracJobId === fracJobId &&
      rangeSelection.haulerId === haulerId &&
      rangeSelection.shift === shift &&
      dateStr >= rangeSelection.startDateStr &&
      dateStr <= rangeSelection.endDateStr;
  };

  const isInDragFill = (fracJobId: number, haulerId: number, dateStr: string, shift: "day" | "night") => {
    if (!dragFill) return false;
    if (dragFill.fracJobId !== fracJobId || dragFill.haulerId !== haulerId || dragFill.shift !== shift) return false;
    const start = dragFill.sourceDateStr <= dragFill.currentDateStr ? dragFill.sourceDateStr : dragFill.currentDateStr;
    const end = dragFill.sourceDateStr <= dragFill.currentDateStr ? dragFill.currentDateStr : dragFill.sourceDateStr;
    return dateStr >= start && dateStr <= end;
  };

  const applyBulkEdit = () => {
    if (!rangeSelection || !activeScenarioId) return;
    if (bulkValue === "") return;
    const value = parseInt(bulkValue) || 0;
    bulkAllocMutation.mutate({
      fracJobId: rangeSelection.fracJobId,
      haulerId: rangeSelection.haulerId,
      startDate: rangeSelection.startDateStr,
      endDate: rangeSelection.endDateStr,
      trucksPerShift: value,
      scenarioId: activeScenarioId,
      shift: rangeSelection.shift,
      ...(value === 0 ? { setZero: true } : {}),
    });
  };

  const clearRange = () => {
    if (!rangeSelection || !activeScenarioId) return;
    bulkAllocMutation.mutate({
      fracJobId: rangeSelection.fracJobId,
      haulerId: rangeSelection.haulerId,
      startDate: rangeSelection.startDateStr,
      endDate: rangeSelection.endDateStr,
      trucksPerShift: 0,
      scenarioId: activeScenarioId,
      shift: rangeSelection.shift,
    });
  };

  const handleDragStart = (fracJobId: number, haulerId: number, dateStr: string, value: number, shift: "day" | "night", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setDragFill({ fracJobId, haulerId, sourceDateStr: dateStr, sourceValue: value, currentDateStr: dateStr, shift });
    setRangeSelection(null);
  };

  const handleDragMove = useCallback((fracJobId: number, haulerId: number, dateStr: string) => {
    if (!isDraggingRef.current || !dragFill) return;
    if (dragFill.fracJobId !== fracJobId || dragFill.haulerId !== haulerId) return;
    setDragFill(prev => prev ? { ...prev, currentDateStr: dateStr } : null);
  }, [dragFill]);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current || !dragFill || !activeScenarioId) {
      isDraggingRef.current = false;
      setDragFill(null);
      return;
    }
    isDraggingRef.current = false;

    const start = dragFill.sourceDateStr <= dragFill.currentDateStr ? dragFill.sourceDateStr : dragFill.currentDateStr;
    const end = dragFill.sourceDateStr <= dragFill.currentDateStr ? dragFill.currentDateStr : dragFill.sourceDateStr;

    if (start === end && start === dragFill.sourceDateStr) {
      setDragFill(null);
      return;
    }

    bulkAllocMutation.mutate({
      fracJobId: dragFill.fracJobId,
      haulerId: dragFill.haulerId,
      startDate: start,
      endDate: end,
      trucksPerShift: dragFill.sourceValue,
      scenarioId: activeScenarioId,
      shift: dragFill.shift,
      ...(dragFill.sourceValue === 0 ? { setZero: true } : {}),
    });
  }, [dragFill, activeScenarioId, bulkAllocMutation]);

  useEffect(() => {
    const onMouseUp = () => {
      if (isDraggingRef.current) {
        handleDragEnd();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [handleDragEnd]);

  const openEditDialog = (fracJobId: number, haulerId: number) => {
    const fracAllocs = allocations.filter(a => a.fracJobId === fracJobId && a.haulerId === haulerId);
    if (fracAllocs.length === 0) {
      setAllocDialogFrac(fracJobId);
      setAllocDialogHauler(haulerId);
      setAllocDialogEdit(null);
      setAllocDialogOpen(true);
      return;
    }
    const longest = fracAllocs.reduce((best, a) => {
      const aLen = new Date(a.endDate).getTime() - new Date(a.startDate).getTime();
      const bLen = new Date(best.endDate).getTime() - new Date(best.startDate).getTime();
      return aLen > bLen ? a : best;
    });
    setAllocDialogFrac(fracJobId);
    setAllocDialogHauler(haulerId);
    setAllocDialogEdit(longest);
    setAllocDialogOpen(true);
  };

  const allHaulerIdsForFrac = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const schedule of activeSchedules) {
      const fracAllocations = allocations.filter(a => a.fracJobId === schedule.fracJobId);
      const haulerIds = Array.from(new Set(fracAllocations.map(a => a.haulerId)));
      map.set(schedule.fracJobId, haulerIds);
    }
    return map;
  }, [activeSchedules, allocations]);

  const tableWidth = LABEL_WIDTH + daysVisible * COL_WIDTH;

  const rangeHasMultipleDates = rangeSelection && rangeSelection.startDateStr !== rangeSelection.endDateStr;

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <div className={`flex items-center justify-between gap-4 px-4 ${compact ? "py-1.5" : "py-3"} border-b bg-background shrink-0`}>
        <div className="flex items-center gap-4 flex-wrap">
          {!compact && (
            <>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="heading-allocation-grid">Allocation Grid</h1>
              <ScenarioSelector />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isStandalone && (
            <div className="flex items-center gap-1" data-testid="preset-buttons">
              {[
                { key: "1W", label: "1W", days: 7 },
                { key: "2W", label: "2W", days: 14 },
                { key: "1M", label: "1M", days: 30 },
                { key: "Q", label: "Q", days: 90 },
              ].map(({ key, label, days }) => (
                <Button
                  key={key}
                  variant={activePreset === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (activePreset === key) {
                      clearPreset();
                    } else {
                      applyPreset(key, days);
                    }
                  }}
                  data-testid={`button-preset-${key}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          {!compact && activeScenarioId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.open(`/api/scenarios/${activeScenarioId}/export`, "_blank");
              }}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigateToDate(addDays(startDate, -7))} data-testid="button-grid-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateToDate(new Date())} data-testid="button-grid-today">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateToDate(addDays(startDate, 7))} data-testid="button-grid-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {rangeHasMultipleDates && (
        <div
          ref={bulkToolbarRef}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b text-sm shrink-0"
          data-testid="toolbar-bulk-edit"
        >
          <span className="text-blue-700 dark:text-blue-300 font-medium">
            {(() => {
              const s = new Date(rangeSelection!.startDateStr + "T00:00:00");
              const e = new Date(rangeSelection!.endDateStr + "T00:00:00");
              const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
              const hauler = haulerMap.get(rangeSelection!.haulerId);
              const shiftLabel = rangeSelection!.shift === "day" ? " · Day" : " · Night";
              return `${days} days selected${hauler ? ` — ${hauler.name}` : ""}${shiftLabel}`;
            })()}
          </span>
          <Input
            type="number"
            min={1}
            placeholder="Trucks"
            value={bulkValue}
            onChange={e => setBulkValue(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-20 h-7 text-xs"
            data-testid="input-bulk-trucks"
            onKeyDown={e => { if (e.key === "Enter") applyBulkEdit(); }}
          />
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-xs"
            onClick={applyBulkEdit}
            disabled={bulkAllocMutation.isPending || !bulkValue}
            data-testid="button-bulk-apply"
          >
            <Check className="w-3 h-3 mr-1" />
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
            onClick={clearRange}
            disabled={bulkAllocMutation.isPending}
            data-testid="button-bulk-clear"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => { setRangeSelection(null); setBulkValue(""); }}
            data-testid="button-bulk-dismiss"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : activeSchedules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">No active frac jobs in this date range</p>
            <p className="text-sm text-muted-foreground">Adjust the date range or add frac jobs to a scenario</p>
          </div>
        </div>
      ) : (
        <div ref={outerScrollRef} className="flex-1 overflow-x-auto flex flex-col min-h-0">
        <div ref={gridScrollRef} className="flex-1 overflow-y-auto relative">
          <table
            className="border-collapse text-xs"
            style={{ tableLayout: "fixed", minWidth: tableWidth, width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }} />
              {dates.map((_, i) => (
                <col key={i} style={{ width: COL_WIDTH, minWidth: COL_WIDTH }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky left-0 z-30 bg-background border-b border-r px-3 py-2 text-left font-medium text-muted-foreground"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                >
                  Frac / Hauler
                </th>
                {dates.map((date, i) => {
                  const ds = dateStrings[i];
                  const isToday = ds === today;
                  const isSelected = ds === selectedDateProp;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isInteractive = !!onDateSelect;
                  return (
                    <th
                      key={i}
                      className={`border-b border-r px-1 py-1.5 text-center font-normal ${
                        isSelected ? "bg-primary/15 font-semibold text-primary ring-1 ring-inset ring-primary/30" :
                        isToday ? "bg-primary/10 font-semibold text-primary" :
                        isWeekend ? "bg-muted/40 text-muted-foreground" :
                        "bg-background text-muted-foreground"
                      } ${isInteractive ? "cursor-pointer hover:bg-accent/50" : ""}`}
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      onClick={() => onDateSelect?.(ds)}
                    >
                      <div className="text-[10px] leading-tight">{format(date, "EEE")}</div>
                      <div className="text-xs leading-tight">{format(date, "M/d")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {activeSchedules.map(schedule => {
              const frac = fracMap.get(schedule.fracJobId);
              const lane = frac ? laneMap.get(frac.laneId) : null;
              if (!frac) return null;

              const uniqueHaulerIds = allHaulerIdsForFrac.get(schedule.fracJobId) || [];

              const isDnExpanded = expandedFracDn.has(schedule.fracJobId);
              return (
                <tbody key={schedule.id}>
                  <tr className="bg-muted/40">
                    <td
                      className="sticky left-0 z-10 bg-muted border-b border-r px-3 py-2"
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            className="shrink-0 flex items-center text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none"
                            onClick={() => toggleFracDn(schedule.fracJobId)}
                            aria-expanded={isDnExpanded}
                            aria-label={isDnExpanded ? `Collapse D/N for ${frac.padName}` : `Expand D/N for ${frac.padName}`}
                            data-testid={`button-dn-toggle-${frac.id}`}
                          >
                            {isDnExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          {lane && (
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: lane.color }} />
                          )}
                          <span className="font-semibold text-sm truncate" data-testid={`text-grid-frac-${frac.id}`}>{frac.padName}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Needs {schedule.requiredTrucksPerShift}{schedule.truckRequirementOverrides ? "*" : ""}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => {
                            setAllocDialogFrac(frac.id);
                            setAllocDialogHauler(undefined);
                            setAllocDialogEdit(null);
                            setAllocDialogOpen(true);
                          }}
                          data-testid={`button-add-alloc-${frac.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    {dateStrings.map((ds, i) => {
                      const active = isSchedActiveOnDate(schedule, ds);
                      if (!active) {
                        return (
                          <td
                            key={i}
                            className="border-b border-r bg-muted/20"
                            style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          />
                        );
                      }
                      const dayTotal = getShiftTotalForFracDay(schedule.fracJobId, ds, "day");
                      const nightTotal = getShiftTotalForFracDay(schedule.fracJobId, ds, "night");
                      const needed = getEffectiveTrucksForDate(schedule, ds);
                      const dayDiff = dayTotal - needed;
                      const nightDiff = nightTotal - needed;
                      if (!isDnExpanded) {
                        const collapsedTotal = Math.max(dayTotal, nightTotal);
                        const collapsedDiff = collapsedTotal - needed;
                        return (
                          <td
                            key={i}
                            className="border-b border-r p-0 cursor-pointer"
                            style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                            data-testid={`cell-frac-total-${frac.id}-${ds}`}
                            onClick={() => toggleFracDn(schedule.fracJobId)}
                          >
                            <div className={`flex items-center justify-center py-1 text-xs font-semibold ${getCellColor(collapsedTotal, needed)}`}>
                              <span className="flex-1 text-center">{collapsedTotal > 0 ? collapsedTotal : ""}</span>
                              {collapsedDiff !== 0 && collapsedTotal > 0 && (
                                <span className={`text-[8px] font-normal pr-0.5 ${collapsedDiff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                  {collapsedDiff > 0 ? `+${collapsedDiff}` : collapsedDiff}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={i}
                          className="border-b border-r p-0"
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          data-testid={`cell-frac-total-${frac.id}-${ds}`}
                        >
                          {(["day", "night"] as const).map((shift) => {
                            const shiftTotal = shift === "day" ? dayTotal : nightTotal;
                            const shiftDiff = shift === "day" ? dayDiff : nightDiff;
                            const label = shift === "day" ? "D" : "N";
                            return (
                              <div
                                key={shift}
                                className={`flex items-center justify-center py-0.5 text-xs font-semibold ${shift === "night" ? "border-t border-border/40" : ""} ${getCellColor(shiftTotal, needed)}`}
                              >
                                <span className="text-[8px] text-muted-foreground/50 w-3 shrink-0 pl-0.5">{label}</span>
                                <span className="flex-1 text-center">{shiftTotal > 0 ? shiftTotal : ""}</span>
                                {shiftDiff !== 0 && shiftTotal > 0 && (
                                  <span className={`text-[8px] font-normal pr-0.5 ${shiftDiff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                    {shiftDiff > 0 ? `+${shiftDiff}` : shiftDiff}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>

                  {uniqueHaulerIds.map(haulerId => {
                    const hauler = haulerMap.get(haulerId);
                    if (!hauler) return null;
                    return (
                      <tr key={`${schedule.id}-${haulerId}`} className="group/hauler-row">
                        <td
                          className="sticky left-0 z-10 bg-background border-b border-r px-3 py-1.5 pl-8"
                          style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground truncate">{hauler.name}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover/hauler-row:opacity-100 transition-opacity shrink-0"
                                onClick={() => openEditDialog(schedule.fracJobId, haulerId)}
                                data-testid={`button-edit-hauler-${schedule.fracJobId}-${haulerId}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover/hauler-row:opacity-100 transition-opacity shrink-0 text-destructive hover:text-destructive"
                                onClick={() => setHaulerToDelete({ fracJobId: schedule.fracJobId, haulerId })}
                                data-testid={`button-delete-hauler-${schedule.fracJobId}-${haulerId}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                                max {hauler.defaultMaxTrucksPerShift}
                              </span>
                            </div>
                          </div>
                        </td>
                        {dateStrings.map((ds, i) => {
                          const active = isSchedActiveOnDate(schedule, ds);
                          if (!active) {
                            return (
                              <td
                                key={i}
                                className="border-b border-r"
                                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                              />
                            );
                          }

                          const dayTrucks = getShiftTrucksForDay(schedule.fracJobId, haulerId, ds, "day");
                          const nightTrucks = getShiftTrucksForDay(schedule.fracJobId, haulerId, ds, "night");
                          const isDayEditing = editingCell?.fracJobId === schedule.fracJobId && editingCell?.haulerId === haulerId && editingCell?.dateStr === ds && editingCell?.shift === "day";
                          const isNightEditing = editingCell?.fracJobId === schedule.fracJobId && editingCell?.haulerId === haulerId && editingCell?.dateStr === ds && editingCell?.shift === "night";
                          const dayInRange = isInRange(schedule.fracJobId, haulerId, ds, "day");
                          const nightInRange = isInRange(schedule.fracJobId, haulerId, ds, "night");
                          const dayInDrag = isInDragFill(schedule.fracJobId, haulerId, ds, "day");
                          const nightInDrag = isInDragFill(schedule.fracJobId, haulerId, ds, "night");

                          const renderSubCell = (shift: "day" | "night") => {
                            const trucks = shift === "day" ? dayTrucks : nightTrucks;
                            const isEditing = shift === "day" ? isDayEditing : isNightEditing;
                            const inRange = shift === "day" ? dayInRange : nightInRange;
                            const inDrag = shift === "day" ? dayInDrag : nightInDrag;
                            const label = shift === "day" ? "D" : "N";
                            const isDivider = shift === "night";

                            if (isEditing) {
                              return (
                                <div key={shift} className={`relative flex items-center ${isDivider ? "border-t border-border/40" : ""}`}>
                                  <span className="text-[8px] text-muted-foreground/60 w-3 shrink-0 pl-0.5">{label}</span>
                                  <input
                                    ref={editInputRef}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value.replace(/[^0-9]/g, ""))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                      if (e.key === "Escape") { e.preventDefault(); cancelEditing(); }
                                      if (e.key === "Tab") { e.preventDefault(); commitEdit(); }
                                    }}
                                    onBlur={cancelEditing}
                                    className="flex-1 h-full text-center text-xs bg-primary/10 border-2 border-primary outline-none py-0.5"
                                    data-testid={`input-cell-edit-${schedule.fracJobId}-${haulerId}-${ds}-${shift}`}
                                  />
                                </div>
                              );
                            }

                            return (
                              <div
                                key={shift}
                                className={`relative flex items-center justify-center py-0.5 cursor-pointer select-none transition-colors group/sub ${isDivider ? "border-t border-border/40" : ""} ${
                                  inRange ? "bg-blue-100 dark:bg-blue-900/30" :
                                  inDrag ? "bg-green-100 dark:bg-green-900/30" :
                                  "hover:bg-accent/50"
                                }`}
                                onClick={(e) => handleShiftCellClick(schedule.fracJobId, haulerId, ds, shift, e)}
                                onDoubleClick={() => handleShiftCellDoubleClick(schedule.fracJobId, haulerId, ds, shift)}
                                onMouseEnter={() => handleDragMove(schedule.fracJobId, haulerId, ds)}
                                data-testid={`cell-hauler-${schedule.fracJobId}-${haulerId}-${ds}-${shift}`}
                              >
                                <span className="text-[8px] text-muted-foreground/50 w-3 shrink-0 pl-0.5">{label}</span>
                                <span className="text-xs text-muted-foreground flex-1 text-center">{trucks > 0 ? trucks : ""}</span>
                                {trucks > 0 && !isDraggingRef.current && (
                                  <div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-3 bg-primary/50 hover:bg-primary cursor-crosshair rounded-sm opacity-0 group-hover/hauler-row:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleDragStart(schedule.fracJobId, haulerId, ds, trucks, shift, e)}
                                    data-testid={`handle-drag-${schedule.fracJobId}-${haulerId}-${ds}-${shift}`}
                                  />
                                )}
                              </div>
                            );
                          };

                          if (!isDnExpanded) {
                            const collapsedTrucks = Math.max(dayTrucks, nightTrucks);
                            return (
                              <td
                                key={i}
                                className="border-b border-r p-0 relative cursor-pointer"
                                style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                                onClick={() => toggleFracDn(schedule.fracJobId)}
                                data-testid={`cell-hauler-collapsed-${schedule.fracJobId}-${haulerId}-${ds}`}
                              >
                                <div className="flex items-center justify-center py-1 hover:bg-accent/50">
                                  <span className="text-xs text-muted-foreground text-center">{collapsedTrucks > 0 ? collapsedTrucks : ""}</span>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={i}
                              className="border-b border-r p-0 relative"
                              style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                            >
                              {renderSubCell("day")}
                              {renderSubCell("night")}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}

          </table>
        </div>
        {(showTotals ?? isStandalone) && (
        <div className="shrink-0 border-t bg-muted/20" data-testid="totals-strip">
          <table className="border-collapse" style={{ tableLayout: "fixed", minWidth: LABEL_WIDTH + COL_WIDTH * dateStrings.length }}>
            <tbody>
              <tr className="bg-muted/30">
                <td
                  className="sticky left-0 z-10 bg-muted border-b border-r p-0 font-semibold text-sm whitespace-nowrap"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  data-testid="text-hauler-totals"
                >
                  <button
                    className="flex items-center gap-1 w-full px-2 py-1 text-left cursor-pointer select-none hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setTotalsExpanded(v => !v)}
                    aria-expanded={totalsExpanded}
                    aria-label={totalsExpanded ? "Collapse Hauler Totals" : "Expand Hauler Totals"}
                  >
                    {totalsExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    Hauler Totals
                  </button>
                </td>
                {dateStrings.map((ds, i) => {
                  const dayTotal = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds && (a.shift === "day" || a.shift === "both" || !a.shift))
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  const nightTotal = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds && (a.shift === "night" || a.shift === "both" || !a.shift))
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  const collapsed = Math.max(dayTotal, nightTotal);
                  return (
                    <td
                      key={i}
                      className="border-b border-r p-0"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      data-testid={`cell-total-${ds}`}
                    >
                      {totalsExpanded ? (
                        (["day", "night"] as const).map((shift) => {
                          const val = shift === "day" ? dayTotal : nightTotal;
                          const label = shift === "day" ? "D" : "N";
                          return (
                            <div key={shift} className={`flex items-center justify-center py-0.5 text-xs font-semibold ${shift === "night" ? "border-t border-border/40" : ""}`}>
                              <span className="text-[8px] text-muted-foreground/50 w-3 shrink-0 pl-0.5">{label}</span>
                              <span className="flex-1 text-center">{val > 0 ? val : ""}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex items-center justify-center py-1 text-xs font-semibold">
                          <span className="text-center">{collapsed > 0 ? collapsed : ""}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="bg-muted/20">
                <td
                  className="sticky left-0 z-10 bg-muted border-b border-r px-3 py-1 font-semibold text-sm text-muted-foreground"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  data-testid="text-frac-needs-total"
                >
                  Frac Needs Total
                </td>
                {dateStrings.map((ds, i) => {
                  const fracNeedsTotal = validSchedules
                    .filter(s => s.plannedStartDate <= ds && s.plannedEndDate >= ds && (s.status === "active" || s.status === "planned" || s.status === "complete"))
                    .reduce((sum, s) => sum + getEffectiveTrucksForDate(s, ds), 0);
                  return (
                    <td
                      key={i}
                      className="border-b border-r text-center text-xs font-medium py-1 text-muted-foreground"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      data-testid={`cell-frac-needs-${ds}`}
                    >
                      {fracNeedsTotal > 0 ? fracNeedsTotal : ""}
                    </td>
                  );
                })}
              </tr>
              <tr className="bg-muted/10">
                <td
                  className="sticky left-0 z-10 bg-muted border-t-2 border-t-border border-b border-r p-0 font-semibold text-sm whitespace-nowrap"
                  style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                  data-testid="text-hauler-surplus"
                >
                  <button
                    className="flex items-center gap-1 w-full px-2 py-1 text-left cursor-pointer select-none hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setSurplusExpanded(v => !v)}
                    aria-expanded={surplusExpanded}
                    aria-label={surplusExpanded ? "Collapse Hauler Surplus" : "Expand Hauler Surplus"}
                  >
                    {surplusExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    Hauler Surplus
                  </button>
                </td>
                {dateStrings.map((ds, i) => {
                  const dayTotal = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds && (a.shift === "day" || a.shift === "both" || !a.shift))
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  const nightTotal = allocations
                    .filter(a => a.startDate <= ds && a.endDate >= ds && (a.shift === "night" || a.shift === "both" || !a.shift))
                    .reduce((sum, a) => sum + a.trucksPerShift, 0);
                  const fracNeedsTotal = validSchedules
                    .filter(s => s.plannedStartDate <= ds && s.plannedEndDate >= ds && (s.status === "active" || s.status === "planned" || s.status === "complete"))
                    .reduce((sum, s) => sum + getEffectiveTrucksForDate(s, ds), 0);
                  const hasFracActivity = fracNeedsTotal > 0;
                  const collapsedSurplus = Math.max(dayTotal, nightTotal) - fracNeedsTotal;
                  const collapsedColor = hasFracActivity && collapsedSurplus > 0 ? "text-emerald-600 dark:text-emerald-400" :
                    hasFracActivity && collapsedSurplus < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
                  return (
                    <td
                      key={i}
                      className="border-t-2 border-t-border border-b border-r p-0"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      data-testid={`cell-surplus-${ds}`}
                    >
                      {surplusExpanded ? (
                        (["day", "night"] as const).map((shift) => {
                          const shiftTotal = shift === "day" ? dayTotal : nightTotal;
                          const surplus = shiftTotal - fracNeedsTotal;
                          const label = shift === "day" ? "D" : "N";
                          return (
                            <div
                              key={shift}
                              className={`flex items-center justify-center py-0.5 text-xs font-semibold ${shift === "night" ? "border-t border-border/40" : ""} ${
                                hasFracActivity && surplus > 0 ? "text-emerald-600 dark:text-emerald-400" :
                                hasFracActivity && surplus < 0 ? "text-red-600 dark:text-red-400" :
                                "text-muted-foreground"
                              }`}
                            >
                              <span className="text-[8px] text-muted-foreground/50 w-3 shrink-0 pl-0.5">{label}</span>
                              <span className="flex-1 text-center">
                                {hasFracActivity ? (surplus > 0 ? `+${surplus}` : surplus === 0 ? "0" : surplus) : ""}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className={`flex items-center justify-center py-1 text-xs font-semibold ${collapsedColor}`}>
                          <span className="text-center">
                            {hasFracActivity ? (collapsedSurplus > 0 ? `+${collapsedSurplus}` : collapsedSurplus === 0 ? "0" : collapsedSurplus) : ""}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        )}
        </div>
      )}

      {isStandalone && activeSchedules.length > 0 && (
        <div className="shrink-0 border-t bg-background px-4 py-2 flex items-center gap-3" data-testid="grid-date-scrollbar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { clearPreset(); setInternalStartDate(d => addDays(d, -1)); }}
            data-testid="button-scroll-left"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{format(startDate, "MMM d, yyyy")}</span>
          <input
            type="range"
            min={-180}
            max={180}
            value={(() => {
              const todayDate = startOfDay(new Date());
              const diff = Math.round((startDate.getTime() - todayDate.getTime()) / 86400000);
              return Math.max(-180, Math.min(180, diff));
            })()}
            className="flex-1 h-3 accent-primary cursor-pointer"
            onChange={(e) => {
              const offset = parseInt(e.target.value);
              clearPreset();
              setInternalStartDate(addDays(startOfDay(new Date()), offset));
            }}
            data-testid="input-date-slider"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(addDays(startDate, daysVisible - 1), "MMM d, yyyy")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { clearPreset(); setInternalStartDate(d => addDays(d, 1)); }}
            data-testid="button-scroll-right"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <AllocationDialog
        open={allocDialogOpen}
        onOpenChange={(open) => {
          setAllocDialogOpen(open);
          if (!open) {
            setAllocDialogFrac(undefined);
            setAllocDialogHauler(undefined);
            setAllocDialogEdit(null);
          }
        }}
        defaultFracJobId={allocDialogFrac}
        defaultHaulerId={allocDialogHauler}
        editAllocation={allocDialogEdit}
      />

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
            <AlertDialogCancel data-testid="button-cancel-capacity-grid">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-accept-capacity-grid"
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

      <AlertDialog open={!!haulerToDelete} onOpenChange={(open) => { if (!open) setHaulerToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Hauler from Frac Job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all allocation blocks for{" "}
              <strong>{haulerToDelete ? haulerMap.get(haulerToDelete.haulerId)?.name : ""}</strong> on this frac job.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-hauler">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-hauler"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (haulerToDelete) {
                  deleteHaulerFromFracMutation.mutate(haulerToDelete);
                  setHaulerToDelete(null);
                }
              }}
            >
              Remove Hauler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function useAllocationTotalsData(startDate: Date, daysVisible: number) {
  const { activeScenarioId } = useScenario();
  const { data: fracJobs = [] } = useQuery<FracJob[]>({ queryKey: ["/api/frac-jobs"] });
  const fracJobIds = useMemo(() => new Set(fracJobs.map(f => f.id)), [fracJobs]);

  const { data: schedules = [] } = useQuery<ScenarioFracSchedule[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "schedules"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/schedules`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const { data: allocations = [] } = useQuery<AllocationBlock[]>({
    queryKey: ["/api/scenarios", activeScenarioId, "allocations"],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      const res = await fetch(`/api/scenarios/${activeScenarioId}/allocations`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeScenarioId,
  });

  const validSchedules = useMemo(() => schedules.filter(s => fracJobIds.has(s.fracJobId)), [schedules, fracJobIds]);

  const dateStrings = useMemo(() =>
    Array.from({ length: daysVisible }, (_, i) => format(addDays(startDate, i), "yyyy-MM-dd")),
    [startDate, daysVisible]
  );

  return { allocations, validSchedules, dateStrings };
}

export default function AllocationGrid() {
  return <AllocationGridContent />;
}
