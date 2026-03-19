# FleetSync

A web-based sand hauling logistics planner for managing fleet allocations across multiple fracking jobs. FleetSync gives operations teams a single view of their Gantt schedule and daily truck allocations, enabling rapid replanning when jobs shift, haulers change capacity, or new work comes in.

## Status

The core planning workflow is fully functional. Users can create frac jobs, assign them to lanes, schedule them across scenarios, allocate hauler trucks per day, detect conflicts in real time, and export data. The interface centers on a combined dashboard with an interactive Gantt chart and an Excel-like allocation grid connected by a draggable splitter.

### What works today

- Full CRUD for frac jobs, haulers, lanes, scenarios, schedules, and allocations
- Interactive Gantt chart with drag-and-drop scheduling across lanes; Quarter/Year zoom with clickable month headers for day-level date selection
- Daily allocation grid with inline and bulk cell editing, drag-to-fill, status-sorted frac rows (Active first), and opaque sticky columns
- Three allocation footer rows: Hauler Totals, Frac Needs Total (shortfall highlighted), and Hauler Surplus (signed daily delta)
- Delete a hauler's allocation from the grid via trash icon (hover to reveal, confirm to delete)
- Add Allocation dialog auto-fills start/end dates from the selected frac's scheduled dates
- Real-time conflict detection with dismissible warnings
- Scenario management: Baseline, Forecast, Actual, Sandbox; clone or start from scratch
- Sandbox isolation: sandbox edits don't touch global frac data
- Truck demand calculations with step-by-step breakdowns and date-segmented overrides
- Daily journal with NPT sub-categories (Mechanical, Weather, Water Limitation, Sand Supply, Truck Shortage, SWA); Gantt shows amber dots on days with entries
- Preset library for storage type and sand design configurations
- CSV and Excel (.xlsx/.xls) import for sand plans
- CSV export: full allocation grid + per-frac detailed reports
- Frac job cloning with pre-filled data and schedule fields
- Lane cascading: extending a frac's end date pushes downstream fracs automatically
- Role-based access: planner vs viewer, controlled via `PLANNER_USERNAMES` env var

### What's next

- Historical tracking and audit trail
- Mobile-responsive layout improvements
- Reporting and analytics dashboards

## Features

### Gantt Chart
- Drag-and-drop frac job scheduling organized by lane
- Zoom controls: Week, Month, Quarter, Year; auto-scroll to today on zoom change
- In Quarter and Year view, clicking anywhere in a month header band selects the exact day at that position
- Selected date shown as a column highlight (visible in Quarter, Month, and Week views)
- Color-coded bars by lane with conflict indicators
- Amber dot indicators on days with journal entries
- Fully opaque "Lanes" sticky column — scrolled content doesn't bleed through
- Drag left/right edge of a bar to resize start or end date independently

### Allocation Grid
- Excel-like daily grid showing hauler truck assignments per frac job
- Frac job rows sorted by status: Active → Planned → Paused → Complete
- Fully opaque sticky "Frac / Hauler" label column
- Inline cell editing: double-click to edit, Enter/Tab to commit, click-away to cancel
- Bulk editing: Shift+click to select a range, apply a value or clear; drag-to-fill handle on valued cells
- Hover a hauler row to reveal pencil (edit block) and trash (delete all blocks for that hauler+frac) icons
- Three summary footer rows:
  - **Hauler Totals** — sum of committed trucks per day
  - **Frac Needs Total** — required trucks per day; red on shortfall
  - **Hauler Surplus** — signed delta (green +N / red −N / neutral 0)
- Dynamic column count auto-fills available width via ResizeObserver
- Date presets (1W / 2W / 1M / Q) and a ±180 day navigation slider in standalone mode

### Add / Edit Allocation Dialog
- Start and End Date fields auto-populate from the selected frac job's scheduled dates
- Dates update reactively when a different frac job is chosen from the dropdown
- Over-capacity saves return a confirmation prompt instead of a hard block

### Dashboard
- Combined Gantt + Allocation Grid on a single page
- Draggable splitter between views (20–80% range)
- Collapsible sections with chevron toggles
- Scrolling or zooming the Gantt syncs the allocation grid's visible date range and column count
- Clicking a date column in either view highlights it in both

### Conflict Detection
- Over-capacity: hauler assignments exceed max trucks per shift (or date-specific exception)
- Under-supplied: frac job has fewer trucks assigned than required
- Over-supplied and hauler split warnings
- Detailed math in each conflict: per-hauler breakdowns, shortage/overage numbers
- Dismissible entries per entity or per type, with restore capability and "show dismissed" toggle

### Scenario Management
- Built-in types: Baseline, Forecast, Actual, Sandbox
- Clone a scenario (copies all schedules and allocations) or start a sandbox from scratch
- Lock scenarios to prevent accidental edits
- Sandbox isolation: deleting a frac in a sandbox only removes its schedule/allocations from that sandbox

### Daily Journal
- Per-frac, per-scenario daily event log
- Categories: NPT, Other; NPT sub-categories: Mechanical, Weather, Water Limitation, Sand Supply, Truck Shortage, SWA
- Hours lost and free-text notes per entry
- Gantt bars show amber dot indicators on days with entries
- Frac detail panel shows collapsible conflict/warning section alongside journal entries

### Import / Export
- **Grid export**: CSV with scenario header, blank-row-separated frac sections, Hauler Totals and Frac Needs Total summary rows
- **Per-frac report**: CSV with frac details, schedule info, daily trucks expected vs assigned, NPT events, hauler assignment summary
- **Sand plan import**: CSV or Excel (.xlsx/.xls) auto-detected; consistent header synonym mapping across both formats

### Frac Job Builder
- Sand plan details: stages/day, tons/stage, total stages, average tons per load
- Travel time and configurable load/unload time
- Storage type and capacity tracking
- Automated truck recommendation with step-by-step formula breakdown
- Clone button pre-fills all data with "(Copy)" suffix

### Hauler Management
- Fleet capacity tracking with default max trucks per shift and minimum committed trucks
- Day-specific capacity exceptions with reason tracking
- Split-allowed flag for multi-frac assignments
- Over-capacity allocations surface a confirmation prompt (not a hard block)

### Lane Management
- Organize frac jobs into sequential lanes (e.g., EVO1, EVO10)
- Custom lane colors and sort ordering
- Lane cascading: extending a frac's end date auto-pushes downstream fracs
- Create, rename, recolor, and delete lanes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Shadcn UI |
| Backend | Express.js, TypeScript |
| Database | PostgreSQL (dev: Replit, prod: Neon), Drizzle ORM |
| Auth | Replit Auth (OpenID Connect) |
| Routing | Wouter (client), Express (server) |
| State | TanStack React Query v5 |
| Validation | Zod, drizzle-zod |
| Excel parsing | SheetJS (xlsx) |

## Data Model

```
Lanes
 └── FracJobs (pad name, customer, basin, sand plan details)
      └── ScenarioFracSchedules (per-scenario dates, required trucks, status, overrides)
      └── AllocationBlocks (hauler-to-frac truck assignments by date range)
      └── FracDailyEvents (journal entries with category, sub_category, hours)

Scenarios (Baseline / Forecast / Actual / Sandbox)
 └── ScenarioFracSchedules
 └── AllocationBlocks

Haulers (name, max capacity, min commitment, split policy)
 └── HaulerCapacityExceptions (date-specific overrides)

Presets (storage type / sand design configurations, system flag)
```

## Project Structure

```
client/src/
  App.tsx                        Main app with auth-based routing
  components/
    gantt-chart.tsx               Interactive Gantt timeline
    app-sidebar.tsx               Navigation sidebar
    scenario-selector.tsx         Scenario dropdown + sandbox creation
    frac-job-dialog.tsx           Create/edit frac job form
    hauler-dialog.tsx             Create/edit hauler form
    allocation-dialog.tsx         Create/edit allocation form (auto-fills frac dates)
    frac-detail-panel.tsx         Side panel with demand breakdown + journal
    frac-clone-dialog.tsx         Clone frac with pre-filled data + schedule fields
    lane-dialog.tsx               Lane management form
  pages/
    landing.tsx                   Auth landing page
    dashboard.tsx                 Combined Gantt + Grid view
    allocation-grid.tsx           Standalone allocation grid
    frac-jobs.tsx                 Frac job management
    haulers.tsx                   Hauler management + capacity

server/
  index.ts                       Express server setup
  routes.ts                      API endpoints + conflict detection
  storage.ts                     Database storage layer (IStorage interface)
  db.ts                          Drizzle database connection
  seed.ts                        Demo seed data (skips destructive cleanup in production)

shared/
  schema.ts                      Drizzle schemas, types, Zod validators
```

## API

All routes require authentication and are prefixed with `/api`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/user` | Current authenticated user |
| GET | `/api/auth/role` | `{ isPlanner: boolean }` |
| GET/POST | `/api/lanes` | List or create lanes |
| PATCH/DELETE | `/api/lanes/:id` | Update or delete a lane |
| GET/POST | `/api/scenarios` | List or create scenarios |
| PATCH/DELETE | `/api/scenarios/:id` | Update or delete a scenario |
| POST | `/api/scenarios/:id/create-sandbox` | Create sandbox from scenario |
| GET/POST | `/api/frac-jobs` | List or create frac jobs |
| GET/PATCH/DELETE | `/api/frac-jobs/:id` | Get, update, or delete a frac job |
| GET | `/api/frac-jobs/:id/report` | Per-frac CSV report (?scenarioId=) |
| GET | `/api/scenarios/:id/schedules` | Schedules for a scenario |
| POST/PATCH/DELETE | `/api/schedules(/:id)` | Manage schedules (PATCH cascades lane) |
| GET/POST | `/api/haulers` | List or create haulers |
| PATCH/DELETE | `/api/haulers/:id` | Update or delete a hauler |
| GET | `/api/haulers/:id/capacity-exceptions` | Hauler capacity exceptions |
| POST/DELETE | `/api/capacity-exceptions(/:id)` | Manage capacity exceptions |
| GET | `/api/scenarios/:id/allocations` | Allocations for a scenario |
| POST | `/api/allocations` | Create allocation (422 if over capacity) |
| POST | `/api/allocations/bulk` | Bulk range replace with split-preservation |
| PATCH/DELETE | `/api/allocations/:id` | Update or delete an allocation |
| DELETE | `/api/allocations/hauler` | Remove all blocks for a hauler+frac in a scenario |
| GET | `/api/scenarios/:id/conflicts` | Computed conflict detection |
| GET | `/api/scenarios/:id/export` | CSV export of allocation grid |
| GET | `/api/scenarios/:id/events` | All events for scenario (used by Gantt dots) |
| GET/POST | `/api/frac-jobs/:id/events` | List or create journal events for a frac |
| PATCH/DELETE | `/api/events/:id` | Update or delete a journal event |
| GET/POST/DELETE | `/api/presets(/:id)` | Manage presets (planner only for write) |

## Getting Started

FleetSync runs on Replit with a PostgreSQL database.

1. Fork or clone the repository
2. Provision a PostgreSQL database — `DATABASE_URL` is set automatically on Replit
3. Set a `SESSION_SECRET` environment variable
4. For production deployments, set `NEON_DATABASE_URL` to your Neon connection string
5. Optionally set `PLANNER_USERNAMES` (comma-separated Replit usernames) to restrict planner access
6. Install dependencies: `npm install`
7. Push the database schema: `npm run db:push`
8. Start the development server: `npm run dev`

The app runs on port 5000 and serves both the frontend and backend from the same server.
