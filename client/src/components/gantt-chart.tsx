import { useRef, useState, useCallback, useMemo } from "react";
import { format, addDays, differenceInDays, parseISO, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lane, FracJob, ScenarioFracSchedule } from "@shared/schema";

interface Conflict {
  type: string;
  date: string;
  entityId: number;
  entityName: string;
  detail: string;
}

interface GanttChartProps {
  lanes: Lane[];
  fracJobs: FracJob[];
  schedules: ScenarioFracSchedule[];
  conflicts: Conflict[];
  onScheduleUpdate?: (scheduleId: number, newStartDate: string, newEndDate: string) => void;
  onFracClick?: (fracJobId: number) => void;
  isLocked?: boolean;
}

type ZoomLevel = "week" | "month" | "quarter" | "year";

const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; label: string }> = {
  week: { dayWidth: 80, label: "Week" },
  month: { dayWidth: 48, label: "Month" },
  quarter: { dayWidth: 16, label: "Quarter" },
  year: { dayWidth: 4, label: "Year" },
};

const LANE_HEADER_WIDTH = 160;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 52;

const STATUS_STYLES: Record<string, string> = {
  active: "ring-2 ring-emerald-500/40",
  planned: "",
  paused: "opacity-70 bg-stripes",
  complete: "opacity-50",
};

export function GanttChart({
  lanes,
  fracJobs,
  schedules,
  conflicts,
  onScheduleUpdate,
  onFracClick,
  isLocked,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");
  const dayWidth = ZOOM_CONFIG[zoomLevel].dayWidth;

  const dateRange = useMemo(() => {
    if (schedules.length === 0) {
      const today = startOfDay(new Date());
      return { start: addDays(today, -7), end: addDays(today, 60), days: 67 };
    }
    const allDates = schedules.flatMap(s => [parseISO(s.plannedStartDate), parseISO(s.plannedEndDate)]);
    const minDate = addDays(new Date(Math.min(...allDates.map(d => d.getTime()))), -7);
    const maxDate = addDays(new Date(Math.max(...allDates.map(d => d.getTime()))), 14);
    return { start: minDate, end: maxDate, days: differenceInDays(maxDate, minDate) + 1 };
  }, [schedules]);

  const today = startOfDay(new Date());
  const todayOffset = differenceInDays(today, dateRange.start);

  const dates = useMemo(() => {
    return Array.from({ length: dateRange.days }, (_, i) => addDays(dateRange.start, i));
  }, [dateRange]);

  const fracMap = useMemo(() => new Map(fracJobs.map(f => [f.id, f])), [fracJobs]);

  const conflictsByFracAndDate = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    for (const c of conflicts) {
      if (c.type === "frac_under_supplied" || c.type === "frac_zero_buffer") {
        const key = `${c.entityId}-${c.date}`;
        const arr = map.get(key) || [];
        arr.push(c);
        map.set(key, arr);
      }
    }
    return map;
  }, [conflicts]);

  const [dragState, setDragState] = useState<{
    scheduleId: number;
    startX: number;
    origStart: string;
    origEnd: string;
    deltaDays: number;
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, schedule: ScenarioFracSchedule) => {
    if (isLocked) return;
    e.preventDefault();
    setDragState({
      scheduleId: schedule.id,
      startX: e.clientX,
      origStart: schedule.plannedStartDate,
      origEnd: schedule.plannedEndDate,
      deltaDays: 0,
    });
  }, [isLocked]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const deltaDays = Math.round(dx / dayWidth);
    setDragState(prev => prev ? { ...prev, deltaDays } : null);
  }, [dragState, dayWidth]);

  const handleMouseUp = useCallback(() => {
    if (!dragState || dragState.deltaDays === 0) {
      setDragState(null);
      return;
    }
    const newStart = format(addDays(parseISO(dragState.origStart), dragState.deltaDays), "yyyy-MM-dd");
    const newEnd = format(addDays(parseISO(dragState.origEnd), dragState.deltaDays), "yyyy-MM-dd");
    onScheduleUpdate?.(dragState.scheduleId, newStart, newEnd);
    setDragState(null);
  }, [dragState, onScheduleUpdate]);

  const scrollBy = (days: number) => {
    scrollRef.current?.scrollBy({ left: days * dayWidth, behavior: "smooth" });
  };

  const scrollToToday = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = todayOffset * dayWidth - scrollRef.current.clientWidth / 2;
    }
  };

  const getSchedulesByLane = (laneId: number) => {
    return schedules.filter(s => {
      const frac = fracMap.get(s.fracJobId);
      return frac?.laneId === laneId;
    });
  };

  const hasConflictOnDate = (fracJobId: number, dateStr: string) => {
    return conflictsByFracAndDate.has(`${fracJobId}-${dateStr}`);
  };

  const getBarConflicts = (schedule: ScenarioFracSchedule) => {
    const result: string[] = [];
    let d = parseISO(schedule.plannedStartDate);
    const end = parseISO(schedule.plannedEndDate);
    while (d <= end) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (hasConflictOnDate(schedule.fracJobId, dateStr)) {
        result.push(dateStr);
      }
      d = addDays(d, 1);
    }
    return result;
  };

  const showDayLabels = zoomLevel === "week" || zoomLevel === "month";

  const monthHeaders = useMemo(() => {
    if (showDayLabels) return [];
    const months: { label: string; startIdx: number; span: number }[] = [];
    let currentMonth = -1;
    let currentYear = -1;
    let currentStart = 0;

    dates.forEach((date, i) => {
      const m = date.getMonth();
      const y = date.getFullYear();
      if (m !== currentMonth || y !== currentYear) {
        if (currentMonth !== -1) {
          months.push({
            label: format(new Date(currentYear, currentMonth, 1), "MMM yyyy"),
            startIdx: currentStart,
            span: i - currentStart,
          });
        }
        currentMonth = m;
        currentYear = y;
        currentStart = i;
      }
    });
    if (currentMonth !== -1) {
      months.push({
        label: format(new Date(currentYear, currentMonth, 1), "MMM yyyy"),
        startIdx: currentStart,
        span: dates.length - currentStart,
      });
    }
    return months;
  }, [dates, showDayLabels]);

  const scrollStepDays = zoomLevel === "week" ? 7 : zoomLevel === "month" ? 14 : zoomLevel === "quarter" ? 30 : 90;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/50">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => scrollBy(-scrollStepDays)} data-testid="button-gantt-scroll-left">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={scrollToToday} data-testid="button-gantt-today">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => scrollBy(scrollStepDays)} data-testid="button-gantt-scroll-right">
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="h-5 w-px bg-border mx-1" />

          <div className="flex items-center rounded-md border bg-background" data-testid="gantt-zoom-controls">
            {(Object.entries(ZOOM_CONFIG) as [ZoomLevel, typeof ZOOM_CONFIG[ZoomLevel]][]).map(([level, config]) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  zoomLevel === level
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                } ${level === "week" ? "rounded-l-md" : ""} ${level === "year" ? "rounded-r-md" : ""}`}
                data-testid={`button-zoom-${level}`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-500/50" /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary/30" /> Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-destructive/30" /> Conflict
          </span>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto relative"
        ref={scrollRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="relative"
          style={{
            width: LANE_HEADER_WIDTH + dateRange.days * dayWidth,
            minHeight: (lanes.length || 1) * ROW_HEIGHT + HEADER_HEIGHT,
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b bg-background"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-30 bg-background border-r flex items-end pb-2 px-3 text-xs font-medium text-muted-foreground"
              style={{ width: LANE_HEADER_WIDTH, minWidth: LANE_HEADER_WIDTH }}
            >
              Lanes
            </div>

            {showDayLabels ? (
              <div className="flex">
                {dates.map((date, i) => {
                  const isToday = format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isMonthStart = date.getDate() === 1;
                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center justify-end pb-1 border-r text-[10px] ${
                        isToday ? "bg-primary/5 font-semibold text-primary" :
                        isWeekend ? "bg-muted/30 text-muted-foreground" :
                        "text-muted-foreground"
                      } ${isMonthStart ? "border-l-2 border-l-border" : ""}`}
                      style={{ width: dayWidth, minWidth: dayWidth }}
                    >
                      {(i === 0 || isMonthStart) && (
                        <span className="text-[9px] font-medium mb-0.5">{format(date, "MMM yyyy")}</span>
                      )}
                      <span>{format(date, "d")}</span>
                      {zoomLevel === "week" && (
                        <span className="text-[9px]">{format(date, "EEE")}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-end relative">
                {monthHeaders.map((mh, i) => (
                  <div
                    key={i}
                    className="flex items-end justify-center pb-2 border-r text-[10px] font-medium text-muted-foreground"
                    style={{ width: mh.span * dayWidth, minWidth: mh.span * dayWidth }}
                  >
                    <span className="truncate px-1">{mh.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lanes.map((lane, laneIdx) => {
            const laneSchedules = getSchedulesByLane(lane.id);
            return (
              <div
                key={lane.id}
                className={`flex ${laneIdx % 2 === 0 ? "" : "bg-muted/20"}`}
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-10 bg-inherit border-r flex items-center gap-2 px-3"
                  style={{ width: LANE_HEADER_WIDTH, minWidth: LANE_HEADER_WIDTH }}
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: lane.color }}
                  />
                  <span className="text-sm font-medium truncate" data-testid={`text-lane-${lane.id}`}>{lane.name}</span>
                </div>

                <div className="relative flex-1" style={{ width: dateRange.days * dayWidth }}>
                  {showDayLabels && dates.map((date, i) => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-r ${isWeekend ? "bg-muted/20" : ""}`}
                        style={{ left: i * dayWidth, width: dayWidth }}
                      />
                    );
                  })}

                  {!showDayLabels && monthHeaders.map((mh, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-border/30"
                      style={{ left: (mh.startIdx + mh.span) * dayWidth, width: 0 }}
                    />
                  ))}

                  {todayOffset >= 0 && todayOffset < dateRange.days && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                      style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                    />
                  )}

                  {laneSchedules.map(schedule => {
                    const frac = fracMap.get(schedule.fracJobId);
                    if (!frac) return null;

                    const startOffset = differenceInDays(parseISO(schedule.plannedStartDate), dateRange.start);
                    const duration = differenceInDays(parseISO(schedule.plannedEndDate), parseISO(schedule.plannedStartDate)) + 1;
                    const barConflicts = getBarConflicts(schedule);
                    const isDragging = dragState?.scheduleId === schedule.id;
                    const dragOffset = isDragging ? dragState.deltaDays : 0;
                    const left = (startOffset + dragOffset) * dayWidth + 2;
                    const width = duration * dayWidth - 4;
                    const showBarText = width > 60;
                    const showTruckCount = width > 40;

                    return (
                      <Tooltip key={schedule.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-2 rounded-md cursor-grab select-none flex items-center gap-1.5 px-2.5 transition-shadow ${
                              isDragging ? "shadow-lg cursor-grabbing z-20 opacity-90" : "hover:shadow-md z-5"
                            } ${STATUS_STYLES[schedule.status] || ""}`}
                            style={{
                              left,
                              width: Math.max(width, dayWidth > 10 ? 40 : 8),
                              height: ROW_HEIGHT - 16,
                              backgroundColor: lane.color + "22",
                              borderLeft: `3px solid ${lane.color}`,
                              overflow: "hidden",
                            }}
                            onMouseDown={(e) => handleMouseDown(e, schedule)}
                            onClick={() => onFracClick?.(schedule.fracJobId)}
                            data-testid={`bar-frac-${schedule.fracJobId}`}
                          >
                            {showBarText && (
                              <span className="text-xs font-medium truncate">{frac.padName}</span>
                            )}
                            {showTruckCount && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {schedule.requiredTrucksPerShift}t
                              </span>
                            )}
                            {showBarText && barConflicts.length > 0 && (
                              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-medium">{frac.padName}</p>
                            <p className="text-xs text-muted-foreground">
                              {frac.customer} &middot; {schedule.status}
                            </p>
                            <p className="text-xs">
                              {format(parseISO(schedule.plannedStartDate), "MMM d")} - {format(parseISO(schedule.plannedEndDate), "MMM d, yyyy")}
                            </p>
                            <p className="text-xs">Required: {schedule.requiredTrucksPerShift} trucks/shift</p>
                            {barConflicts.length > 0 && (
                              <p className="text-xs text-destructive font-medium">
                                {barConflicts.length} day(s) with conflicts
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
