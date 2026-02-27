# FleetSync

A web-based sand hauling logistics planner for managing fleet allocations across multiple fracking jobs. FleetSync gives operations teams a single view of their Gantt schedule and daily truck allocations, enabling rapid replanning when jobs shift, haulers change capacity, or new work comes in.

## MVP Status

FleetSync is currently in active MVP development. The core planning workflow is functional: users can create frac jobs, assign them to lanes, schedule them across scenarios, allocate hauler trucks, and detect conflicts in real time. The interface centers on a combined dashboard with an interactive Gantt chart and an Excel-like allocation grid, connected by a draggable splitter.

### What works today

- Full CRUD for frac jobs, haulers, lanes, scenarios, schedules, and allocations
- Interactive Gantt chart with drag-and-drop scheduling across lanes
- Daily allocation grid with inline cell editing (click to edit, Enter/Tab to commit)
- Real-time conflict detection with dismissible warnings
- Scenario management with clone support for planning variants
- Truck demand calculations with step-by-step breakdowns
- Responsive split-pane dashboard with date synchronization between views

### What's next

- Bulk operations and import/export
- Historical tracking and audit trail
- Reporting and analytics dashboards
- Mobile-responsive layout improvements

## Features

### Gantt Chart
- Drag-and-drop frac job scheduling organized by lane
- Zoom controls: Week, Month, Quarter, Year
- Auto-scroll to today when changing zoom level
- Color-coded bars by lane with conflict indicators
- Click any date column to highlight and sync with the allocation grid

### Allocation Grid
- Excel-like daily grid showing hauler truck assignments per frac job
- Inline cell editing with Enter/Tab to commit, click-away to cancel
- Dynamic column count that auto-fills available width
- Sticky row/column headers for easy navigation
- Automatic block splitting when editing multi-day allocations

### Dashboard
- Combined Gantt + Allocation Grid on a single page
- Draggable splitter between views (20-80% range)
- Collapsible sections with chevron toggles
- Shared date selection and synchronized scrolling

### Conflict Detection
- Over-capacity detection when hauler assignments exceed their truck limit
- Under-supplied detection when frac jobs don't have enough trucks allocated
- Over-supplied and hauler split warnings
- Orphaned schedule protection (skips conflicts for deleted frac jobs)
- Dismissible conflict entries per entity or per type, with restore capability

### Scenario Management
- Built-in scenario types: Baseline, Forecast, Actual, Sandbox
- Clone scenarios with all schedules and allocations
- Lock scenarios to prevent accidental edits
- Compare different planning versions side by side

### Frac Job Builder
- Sand plan details: stages/day, tons/stage, total stages
- Travel time, average tons per load, load/unload time
- Storage type and capacity tracking
- Automated truck recommendation with step-by-step formula breakdown

### Hauler Management
- Fleet capacity tracking with default max trucks per shift
- Minimum committed trucks per shift
- Day-specific capacity exceptions with reason tracking
- Split-allowed flag for multi-frac assignments

### Lane Management
- Organize frac jobs into sequential lanes (e.g., EVO1, EVO10)
- Custom lane colors and sort ordering
- Create, rename, recolor, and delete lanes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Shadcn UI |
| Backend | Express.js, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Replit Auth (OpenID Connect) |
| Routing | Wouter (client), Express (server) |
| State | TanStack React Query v5 |
| Validation | Zod, drizzle-zod |

## Data Model

```
Lanes
 └── FracJobs (pad name, customer, basin, sand plan details)
      └── ScenarioFracSchedules (per-scenario dates, required trucks, status)
      └── AllocationBlocks (hauler-to-frac truck assignments by date range)

Scenarios (Baseline / Forecast / Actual / Sandbox)
 └── ScenarioFracSchedules
 └── AllocationBlocks

Haulers (name, max capacity, min commitment, split policy)
 └── HaulerCapacityExceptions (date-specific overrides)
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
    allocation-dialog.tsx         Create/edit allocation form
    frac-detail-panel.tsx         Side panel with demand breakdown
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
  seed.ts                        Demo seed data

shared/
  schema.ts                      Drizzle schemas, types, Zod validators
```

## API

All routes require authentication and are prefixed with `/api`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/user` | Current authenticated user |
| GET/POST | `/api/lanes` | List or create lanes |
| PATCH/DELETE | `/api/lanes/:id` | Update or delete a lane |
| GET/POST | `/api/scenarios` | List or create scenarios |
| PATCH/DELETE | `/api/scenarios/:id` | Update or delete a scenario |
| POST | `/api/scenarios/:id/clone` | Clone scenario with schedules + allocations |
| GET/POST | `/api/frac-jobs` | List or create frac jobs |
| GET/PATCH/DELETE | `/api/frac-jobs/:id` | Get, update, or delete a frac job |
| GET | `/api/scenarios/:id/schedules` | Schedules for a scenario |
| POST/PATCH/DELETE | `/api/schedules(/:id)` | Manage schedules |
| GET/POST | `/api/haulers` | List or create haulers |
| PATCH/DELETE | `/api/haulers/:id` | Update or delete a hauler |
| GET | `/api/haulers/:id/capacity-exceptions` | Hauler capacity exceptions |
| POST/DELETE | `/api/capacity-exceptions(/:id)` | Manage capacity exceptions |
| GET | `/api/scenarios/:id/allocations` | Allocations for a scenario |
| POST/PATCH/DELETE | `/api/allocations(/:id)` | Manage allocations |
| GET | `/api/scenarios/:id/conflicts` | Computed conflict detection |

## Getting Started

FleetSync is built to run on Replit with a PostgreSQL database.

1. Fork or clone the repository
2. Set up a PostgreSQL database and configure `DATABASE_URL`
3. Set a `SESSION_SECRET` environment variable
4. Install dependencies: `npm install`
5. Push the database schema: `npm run db:push`
6. Start the development server: `npm run dev`

The app runs on port 5000 and serves both the frontend and backend from the same server.
