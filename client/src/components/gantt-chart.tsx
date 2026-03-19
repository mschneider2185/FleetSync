import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { format, addDays, differenceInDays, parseISO, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lane, FracJob, ScenarioFracSchedule } from "@shared/schema";
import { getEffectiveScheduleStatus } from "@/lib/schedule-status";

interface Conflict {
  type: string;
  date: string;
  entityId: number;
  entityName: string;
  detail: string;
}

interface JournalEvent {
  fracJobId: number;
  date: string;
}

interface GanttChartProps {
  lanes: Lane[];
  fracJobs: FracJob[];
  schedules: ScenarioFracSchedule[];
  conflicts: Conflict[];
  journalEvents?: JournalEvent[];
  onScheduleUpdate?: (scheduleId: number, newStartDate: string, newEndDate: string) => void;
  onFracClick?: (fracJobId: number) => void;
  onDateSelect?: (dateStr: string | null) => void;
  onViewDateChange?: (dateStr: string) => void;
  onVisibleRangeChange?: (firstVisibleDate: string, numDays: number) => void;
  selectedDate?: string | null;
  focusedDate?: string | null;
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
  journalEvents = [],
  onScheduleUpdate,
  onFracClick,
  onDateSelect,
  onViewDateChange,
  onVisibleRangeChange,
  selectedDate,
  focusedDate,
  isLocked,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocusedDateRef = useRef<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");
  const dayWidth = ZOOM_CONFIG[zoomLevel].dayWidth;

  const journalByFrac = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const evt of journalEvents) {
      if (!map.has(evt.fracJobId)) map.set(evt.fracJobId, new Set());
      map.get(evt.fracJobId)!.add(evt.date);
    }
    return map;
  }, [journalEvents]);

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
      if (c.type === "frac_under_supplied") {
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
    mode: "move" | "resize-left" | "resize-right";
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, schedule: ScenarioFracSchedule, mode: "move" | "resize-left" | "resize-right" = "move") => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      scheduleId: schedule.id,
      startX: e.clientX,
      origStart: schedule.plannedStartDate,
      origEnd: schedule.plannedEndDate,
      deltaDays: 0,
      mode,
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

    let newStart: string;
    let newEnd: string;

    if (dragState.mode === "move") {
      newStart = format(addDays(parseISO(dragState.origStart), dragState.deltaDays), "yyyy-MM-dd");
      newEnd = format(addDays(parseISO(dragState.origEnd), dragState.deltaDays), "yyyy-MM-dd");
    } else if (dragState.mode === "resize-left") {
      const proposedStart = addDays(parseISO(dragState.origStart), dragState.deltaDays);
      const endDate = parseISO(dragState.origEnd);
      if (proposedStart > endDate) {
        setDragState(null);
        return;
      }
      newStart = format(proposedStart, "yyyy-MM-dd");
      newEnd = dragState.origEnd;
    } else {
      const startDate = parseISO(dragState.origStart);
      const proposedEnd = addDays(parseISO(dragState.origEnd), dragState.deltaDays);
      if (proposedEnd < startDate) {
        setDragState(null);
        return;
      }
      newStart = dragState.origStart;
      newEnd = format(proposedEnd, "yyyy-MM-dd");
    }

    onScheduleUpdate?.(dragState.scheduleId, newStart, newEnd);
    setDragState(null);
  }, [dragState, onScheduleUpdate]);

  const getVisibleCenterDate = (el: HTMLDivElement) => {
    const centerPx = el.scrollLeft + el.clientWidth / 2;
    const dayIndex = Math.floor(centerPx / dayWidth);
    return format(addDays(dateRange.start, Math.max(0, Math.min(dayIndex, dateRange.days - 1))), "yyyy-MM-dd");
  };

  const scrollToDate = useCallback((dateStr: string, behavior: ScrollBehavior = "smooth") => {
    if (!scrollRef.current) return;
    const dayOffset = differenceInDays(parseISO(dateStr), dateRange.start);
    if (dayOffset < 0 || dayOffset >= dateRange.days) return;
    scrollRef.current.scrollTo({
      left: dayOffset * dayWidth - scrollRef.current.clientWidth / 2,
      behavior,
    });
    onViewDateChange?.(dateStr);
  }, [dateRange, dayWidth, onViewDateChange]);

  const reportVisibleRange = useCallback(() => {
    if (!scrollRef.current || !onVisibleRangeChange) return;
    const el = scrollRef.current;
    const scrollLeft = Math.max(0, el.scrollLeft - LANE_HEADER_WIDTH);
    const visibleWidth = el.clientWidth - LANE_HEADER_WIDTH;
    const firstDayIndex = Math.max(0, Math.floor(scrollLeft / dayWidth));
    const numDays = Math.max(7, Math.ceil(visibleWidth / dayWidth));
    const firstDate = format(addDays(dateRange.start, Math.min(firstDayIndex, dateRange.days - 1)), "yyyy-MM-dd");
    onVisibleRangeChange(firstDate, numDays);
  }, [dayWidth, dateRange, onVisibleRangeChange]);

  const handleScroll = useCallback(() => {
    reportVisibleRange();
  }, [reportVisibleRange]);

  useEffect(() => {
    reportVisibleRange();
  }, [zoomLevel, reportVisibleRange]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (focusedDate) {
        scrollToDate(focusedDate, "auto");
      } else if (scrollRef.current) {
        scrollRef.current.scrollLeft = todayOffset * dayWidth - scrollRef.current.clientWidth / 2;
      }
    });
  }, [focusedDate, scrollToDate, todayOffset, dayWidth]);

  useEffect(() => {
    if (!focusedDate) {
      lastFocusedDateRef.current = null;
      return;
    }
    if (lastFocusedDateRef.current === focusedDate) return;
    lastFocusedDateRef.current = focusedDate;
    requestAnimationFrame(() => {
      scrollToDate(focusedDate);
    });
  }, [focusedDate, scrollToDate]);

  const scrollBy = (days: number) => {
    if (!scrollRef.current) return;
    onDateSelect?.(null);
    scrollRef.current.scrollBy({ left: days * dayWidth, behavior: "smooth" });
    setTimeout(() => {
      if (scrollRef.current && onViewDateChange) {
        onViewDateChange(getVisibleCenterDate(scrollRef.current));
      }
    }, 350);
  };

  const scrollToToday = () => {
    onDateSelect?.(null);
    scrollToDate(format(new Date(), "yyyy-MM-dd"), "auto");
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
                onClick={() => {
                  setZoomLevel(level);
                }}
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
        className="flex-1 overflow-auto relative gantt-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
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
                  const dateStr = format(date, "yyyy-MM-dd");
                  const isToday = dateStr === format(today, "yyyy-MM-dd");
                  const isSelected = dateStr === selectedDate;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isMonthStart = date.getDate() === 1;
                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center justify-end pb-1 border-r text-[10px] cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/15 font-semibold text-primary ring-1 ring-inset ring-primary/30" :
                        isToday ? "bg-primary/5 font-semibold text-primary" :
                        isWeekend ? "bg-muted/30 text-muted-foreground" :
                        "text-muted-foreground hover:bg-muted/20"
                      } ${isMonthStart ? "border-l-2 border-l-border" : ""}`}
                      style={{ width: dayWidth, minWidth: dayWidth }}
                      onClick={() => onDateSelect?.(dateStr)}
                      data-testid={`gantt-date-${dateStr}`}
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
                    className="flex items-end justify-center pb-2 border-r text-[10px] font-medium text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors select-none"
                    style={{ width: mh.span * dayWidth, minWidth: mh.span * dayWidth }}
                    onClick={(e) => {
                      if (!onDateSelect) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const dayIndex = Math.max(0, Math.min(Math.floor(x / dayWidth), mh.span - 1));
                      const clickedDate = format(addDays(dateRange.start, mh.startIdx + dayIndex), "yyyy-MM-dd");
                      onDateSelect(clickedDate);
                    }}
                    title={zoomLevel === "year" ? "Click to select a day" : undefined}
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
                  className="sticky left-0 z-10 bg-background border-r flex items-center gap-2 px-3"
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

                  {selectedDate && zoomLevel !== "year" && (() => {
                    const selOffset = differenceInDays(parseISO(selectedDate), dateRange.start);
                    if (selOffset >= 0 && selOffset < dateRange.days) {
                      return (
                        <div
                          className="absolute top-0 bottom-0 bg-primary/8 z-0 border-l border-r border-primary/20"
                          style={{ left: selOffset * dayWidth, width: Math.max(dayWidth, 2) }}
                        />
                      );
                    }
                    return null;
                  })()}

                  {laneSchedules.map(schedule => {
                    const frac = fracMap.get(schedule.fracJobId);
                    if (!frac) return null;
                    const effectiveStatus = getEffectiveScheduleStatus(schedule);

                    const startOffset = differenceInDays(parseISO(schedule.plannedStartDate), dateRange.start);
                    const duration = differenceInDays(parseISO(schedule.plannedEndDate), parseISO(schedule.plannedStartDate)) + 1;
                    const barConflicts = getBarConflicts(schedule);
                    const isDragging = dragState?.scheduleId === schedule.id;
                    const dragOffset = isDragging ? dragState.deltaDays : 0;

                    let visualStartOffset = startOffset;
                    let visualDuration = duration;
                    if (isDragging) {
                      if (dragState.mode === "move") {
                        visualStartOffset = startOffset + dragOffset;
                      } else if (dragState.mode === "resize-left") {
                        visualStartOffset = startOffset + dragOffset;
                        visualDuration = duration - dragOffset;
                      } else if (dragState.mode === "resize-right") {
                        visualDuration = duration + dragOffset;
                      }
                      if (visualDuration < 1) visualDuration = 1;
                    }

                    const left = visualStartOffset * dayWidth + 2;
                    const width = visualDuration * dayWidth - 4;
                    const showBarText = width > 60;
                    const showTruckCount = width > 40;
                    const canResize = !isLocked && onScheduleUpdate;

                    return (
                      <Tooltip key={schedule.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-2 rounded-md select-none flex items-center transition-shadow group ${
                              isDragging && dragState.mode === "move" ? "shadow-lg cursor-grabbing z-20 opacity-90" :
                              isDragging ? "shadow-lg z-20 opacity-90" :
                              "hover:shadow-md z-5"
                            } ${!isDragging && !isLocked ? "cursor-grab" : ""} ${STATUS_STYLES[effectiveStatus] || ""}`}
                            style={{
                              left,
                              width: Math.max(width, dayWidth > 10 ? 40 : 8),
                              height: ROW_HEIGHT - 16,
                              backgroundColor: lane.color + "22",
                              borderLeft: `3px solid ${lane.color}`,
                            }}
                            onMouseDown={(e) => handleMouseDown(e, schedule, "move")}
                            onClick={() => onFracClick?.(schedule.fracJobId)}
                            data-testid={`bar-frac-${schedule.fracJobId}`}
                          >
                            {canResize && (
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 hover:bg-foreground/10 rounded-l-md"
                                onMouseDown={(e) => handleMouseDown(e, schedule, "resize-left")}
                                data-testid={`handle-resize-left-${schedule.fracJobId}`}
                              />
                            )}
                            <div className="flex items-center gap-1.5 px-2.5 overflow-hidden flex-1 min-w-0">
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
                            {dayWidth >= 8 && (() => {
                              const fracEvents = journalByFrac.get(schedule.fracJobId);
                              if (!fracEvents || fracEvents.size === 0) return null;
                              const dots: JSX.Element[] = [];
                              for (let di = 0; di < duration; di++) {
                                const dayDate = format(addDays(parseISO(schedule.plannedStartDate), di), "yyyy-MM-dd");
                                if (fracEvents.has(dayDate)) {
                                  dots.push(
                                    <div
                                      key={di}
                                      className="absolute bottom-0.5 rounded-full bg-amber-500"
                                      style={{
                                        left: di * dayWidth + dayWidth / 2 - (dayWidth >= 16 ? 3 : 2),
                                        width: dayWidth >= 16 ? 6 : 4,
                                        height: dayWidth >= 16 ? 6 : 4,
                                      }}
                                      data-testid={`dot-journal-${schedule.fracJobId}-${dayDate}`}
                                    />
                                  );
                                }
                              }
                              return dots;
                            })()}
                            {canResize && (
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 hover:bg-foreground/10 rounded-r-md"
                                onMouseDown={(e) => handleMouseDown(e, schedule, "resize-right")}
                                data-testid={`handle-resize-right-${schedule.fracJobId}`}
                              />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-medium">{frac.padName}</p>
                            <p className="text-xs text-muted-foreground">
                              {frac.customer} &middot; {effectiveStatus}
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
                            {(journalByFrac.get(schedule.fracJobId)?.size ?? 0) > 0 && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                {journalByFrac.get(schedule.fracJobId)!.size} day(s) with journal notes
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
