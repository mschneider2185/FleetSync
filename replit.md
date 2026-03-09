# FleetSync - Sand Hauling Logistics Planner

## Overview
A web-based planning tool to visualize and manage sand-hauling fleet allocations across multiple fracs, with an interactive Gantt schedule and daily allocation grid, supporting rapid replans.

## Architecture
- **Frontend**: React + TypeScript, Tailwind CSS, Shadcn UI components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect)
- **Routing**: Wouter (client-side), Express (server-side)
- **State**: TanStack React Query for data fetching

## Data Model
- **Lanes**: Fleet lanes (e.g., EVO1, EVO10) that group sequential frac jobs
- **FracJobs**: Individual frac operations with sand plan details (stages/day, tons/stage, travel time, storage)
- **Scenarios**: Planning versions (Baseline, Forecast, Actual, Sandbox) with cloning support; includes `createdByUserId` for sandbox ownership
- **ScenarioFracSchedules**: Per-scenario scheduling (dates, required trucks/shift, status, truckRequirementOverrides JSON for date-segmented changes)
- **Haulers**: Trucking companies with max capacity and minimum commitments
- **HaulerCapacityExceptions**: Day-specific hauler capacity overrides
- **AllocationBlocks**: Hauler-to-frac truck assignments by date range and scenario
- **Presets**: Reusable configurations (storage or sand_design type) with JSON data, system flag
- **FracDailyEvents**: Daily journal entries per frac+scenario with category (NPT, MECHANICAL, WEATHER, etc.), hours lost, notes

## Key Features (MVP)
- Interactive Gantt chart with drag-and-drop frac scheduling by lane, zoom controls (Week/Month/Quarter/Year) with auto-scroll to today on zoom change, visible horizontal scrollbar, and amber dot indicators for days with journal entries (fetched via `GET /api/scenarios/:id/events`)
- Daily allocation grid (Excel-like) with dynamic column count (auto-fills available width via ResizeObserver), sticky headers, and inline cell editing
- Combined dashboard view: Gantt chart and allocation grid on the same page with draggable splitter (20-80% range), collapsible sections (chevron toggles), Gantt→Grid timeframe sync (scroll/zoom Gantt updates grid's visible date range and column count), and clickable date column highlighting
- Inline cell editing in allocation grid: double-click any cell to edit truck count (Enter/Tab commits, click-away cancels), with automatic block splitting for multi-day allocations and ref-guarded save to prevent double-fire
- Bulk editing in allocation grid: (1) click to select a cell, Shift+click to extend range, then use bulk toolbar to apply a value or clear the range; (2) drag-to-fill handle on right edge of valued cells to copy value across adjacent dates; (3) pencil edit button on hover of hauler row labels opens pre-filled AllocationDialog for editing entire blocks
- Scenario management (Actual/Sandbox) with sandbox creation (copy-from-parent or blank canvas "Start from scratch") and role-based access (planner vs viewer)
- Lane cascading: extending a frac's end date auto-pushes downstream fracs in the same lane
- Frac job builder with sand plan details (including configurable load+unload time)
- Hauler management with capacity tracking; over-capacity allocations show a confirmation warning (422 + `requiresConfirmation`) instead of hard-blocking, allowing users to accept or cancel via AlertDialog; `force: true` bypasses the check
- Real-time conflict detection (over-capacity, under-supplied, over-supplied, hauler split warnings) with orphaned schedule protection
- Dismissible conflict entries: per-entity and per-type dismiss/restore with "show dismissed" toggle in conflict sheet
- Frac detail panel with sand info, demand calculations (uses floor for loads/truck/shift), hauler assignments, daily journal with collapsible frac-specific conflicts section (Issues & Warnings with collapsed date ranges), and per-frac CSV report export button
- Preset library: system presets for storage type and sand design, applied via dropdowns in frac job dialog
- Frac Needs Total footer row in allocation grid: sums required trucks across active/planned/complete schedules per day, highlights shortfalls in red; defensively filters out orphaned schedules
- Sand plan import supports both CSV and Excel (.xlsx/.xls) files with auto-detection; uses `xlsx` (SheetJS) package for Excel parsing with same header synonym mapping
- CSV export includes Hauler Totals and Frac Needs Total summary rows at the bottom of the grid data
- Frac-level cloning: Clone button on frac cards and detail panel, pre-fills all frac data with "(Copy)" suffix, includes schedule fields for immediate scheduling
- Date-segmented truck requirements: `truckRequirementOverrides` JSON on schedules allows forward-only changes (e.g., change trucks from date X onward); helper `getEffectiveTrucksForDate()` used in grid, footer, and conflict detection
- Frac Jobs page with collapsible Active/Planned/Archived sections (based on schedule status), defaulting Archived to collapsed
- Allocation grid date presets (1W/2W/1M/Q) in standalone mode: snap start date to period start (week Monday, month 1st, quarter 1st) and set day count; date navigation slider for smooth scrolling ±180 days
- Lane management panel (create, rename, recolor, delete lanes)
- Schedule editing from Frac Jobs page (both add and edit schedule dates/trucks/status)
- Step-by-step truck recommendation breakdown in demand tab
- Chained "Add Job" workflow from dashboard: creates frac job then prompts for schedule dates
- All error toasts show actual server validation errors (field-level Zod errors with path info)

## Project Structure
```
client/src/
  App.tsx                      # Main app with auth-based routing
  components/
    app-sidebar.tsx            # Navigation sidebar
    gantt-chart.tsx            # Custom Gantt timeline component
    scenario-selector.tsx      # Scenario dropdown + sandbox creation
    frac-job-dialog.tsx        # Create/edit frac job form (with useEffect reset)
    hauler-dialog.tsx          # Create/edit hauler form (with useEffect reset)
    allocation-dialog.tsx      # Create/edit allocation form
    frac-detail-panel.tsx      # Side panel with frac details + demand breakdown + truck overrides
    frac-clone-dialog.tsx      # Clone frac dialog with pre-filled data + schedule fields
    lane-dialog.tsx            # Create/edit lane (name, color, sort order)
  pages/
    landing.tsx                # Auth landing page
    dashboard.tsx              # Combined Gantt + Allocation Grid view with collapsible sections
    allocation-grid.tsx        # Allocation grid (reusable AllocationGridContent + standalone page)
    frac-jobs.tsx              # Frac job management
    haulers.tsx                # Hauler management + capacity view
  hooks/
    use-auth.ts                # Replit Auth hook
    use-scenario.tsx           # Active scenario context

server/
  index.ts                     # Express server setup
  routes.ts                    # API endpoints
  storage.ts                   # Database storage layer (IStorage interface)
  db.ts                        # Drizzle database connection
  seed.ts                      # Seed data for demo
  replit_integrations/auth/    # Replit Auth integration

shared/
  schema.ts                    # Drizzle schemas, types, and Zod validators
  models/auth.ts               # Auth-related schemas (users, sessions)
```

## API Routes
All routes are prefixed with `/api` and require authentication (except auth routes).

### Auth
- `GET /api/login` - Begin login flow
- `GET /api/logout` - Logout
- `GET /api/auth/user` - Get current user

### CRUD
- `/api/lanes` - GET, POST; `/api/lanes/:id` - PATCH, DELETE
- `/api/scenarios` - GET, POST; `/api/scenarios/:id` - PATCH, DELETE
- `/api/scenarios/:id/create-sandbox` - POST (create sandbox from scenario)
- `/api/frac-jobs` - GET, POST; `/api/frac-jobs/:id` - GET, PATCH, DELETE (?scenarioId= for sandbox-scoped removal)
- `/api/scenarios/:scenarioId/schedules` - GET
- `/api/schedules` - POST; `/api/schedules/:id` - PATCH (with lane cascading), DELETE
- `/api/haulers` - GET, POST; `/api/haulers/:id` - PATCH, DELETE
- `/api/haulers/:id/capacity-exceptions` - GET
- `/api/capacity-exceptions` - POST; `/api/capacity-exceptions/:id` - DELETE
- `/api/scenarios/:scenarioId/allocations` - GET
- `/api/allocations` - POST; `/api/allocations/bulk` - POST (range replace with split-preservation); `/api/allocations/:id` - PATCH, DELETE
- `/api/scenarios/:scenarioId/conflicts` - GET (computed conflict detection with detailed explanations)
- `/api/scenarios/:scenarioId/export` - GET (CSV export of allocation grid)
- `/api/presets` - GET (?type= filter), POST, DELETE /:id (planner only)
- `/api/frac-jobs/:id/events` - GET (?scenarioId=), POST
- `/api/events/:id` - PATCH, DELETE
- `/api/auth/role` - GET (returns { isPlanner: boolean })

## Sandbox Isolation
- Frac jobs are global entities shared across scenarios; schedules/allocations are per-scenario
- Deleting a frac in sandbox mode only removes its schedule/allocations from that sandbox (not the global frac job)
- Editing frac global properties (pad name, customer) is blocked in sandbox mode
- Global frac deletion requires planner role and is only allowed from non-sandbox scenarios

## Deployment
- Configured for autoscale deployment with `npm run build` + `npm run start` (NODE_ENV=production)
- In production, `cleanupScenarios()` in seed.ts is skipped to prevent destructive dev-only cleanup
- `seedPresets()` and `cleanupOrphanedData()` run in all environments (safe/idempotent)

## Capacity Hard-Stop
- Allocation POST/PATCH validates hauler capacity: if saving would exceed `defaultMaxTrucksPerShift` (or date-specific exceptions), returns 409
- Frac over/under supply detected in conflict engine but does not block saves

## CSV Export
- `GET /api/scenarios/:scenarioId/export` returns CSV with scenario name + export date header rows, blank rows between frac sections, Lane/Frac/Hauler columns + date columns, plus Hauler Totals and Frac Needs Total summary rows
- `GET /api/frac-jobs/:id/report?scenarioId=X` returns per-frac CSV report with frac details, schedule info, daily trucks expected vs assigned, NPT events, and hauler assignment summary
- Export button in allocation grid toolbar (non-compact mode only)
- Per-frac "Report" button in frac detail panel header (when scenario is selected)

## Gantt Features
- Drag entire bar to move schedule start+end together
- Drag left/right edge to resize schedule (change start or end date independently)
- Resize handles visible on hover, respects locked scenario

## Conflict Engine
- Conflicts include detailed math: per-hauler breakdowns, per-frac assignments, shortage/overage numbers
- Capacity exceptions properly consulted per-date for hauler over-capacity checks

## Role-Based Access
- `PLANNER_USERNAMES` env var: comma-separated Replit usernames; if empty, all users are planners
- Planners can edit Actual scenarios, create presets, create sandboxes, permanently delete frac jobs
- Viewers can create sandboxes and edit their own sandbox scenarios
