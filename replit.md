# SandPlan - Sand Hauling Logistics Planner

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
- **Scenarios**: Planning versions (Baseline, Forecast, Actual, Sandbox) with cloning support
- **ScenarioFracSchedules**: Per-scenario scheduling (dates, required trucks/shift, status)
- **Haulers**: Trucking companies with max capacity and minimum commitments
- **HaulerCapacityExceptions**: Day-specific hauler capacity overrides
- **AllocationBlocks**: Hauler-to-frac truck assignments by date range and scenario

## Key Features (MVP)
- Interactive Gantt chart with drag-and-drop frac scheduling by lane
- Daily allocation grid (Excel-like) with proper column alignment, sticky headers, and inline cell editing
- Inline cell editing in allocation grid: click any cell to edit truck count, with automatic block splitting for multi-day allocations
- Scenario management (Baseline/Forecast/Sandbox) with clone and compare
- Frac job builder with sand plan details (including configurable load+unload time)
- Hauler management with capacity tracking
- Real-time conflict detection (over-capacity, under-supplied, zero buffer)
- Frac detail panel with sand info, demand calculations (uses floor for loads/truck/shift), and hauler assignments
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
    frac-detail-panel.tsx      # Side panel with frac details + demand breakdown
    lane-dialog.tsx            # Create/edit lane (name, color, sort order)
  pages/
    landing.tsx                # Auth landing page
    dashboard.tsx              # Gantt schedule view (main page)
    allocation-grid.tsx        # Daily allocation grid
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
- `/api/scenarios/:id/clone` - POST (clone with schedules + allocations)
- `/api/frac-jobs` - GET, POST; `/api/frac-jobs/:id` - GET, PATCH, DELETE
- `/api/scenarios/:scenarioId/schedules` - GET
- `/api/schedules` - POST; `/api/schedules/:id` - PATCH, DELETE
- `/api/haulers` - GET, POST; `/api/haulers/:id` - PATCH, DELETE
- `/api/haulers/:id/capacity-exceptions` - GET
- `/api/capacity-exceptions` - POST; `/api/capacity-exceptions/:id` - DELETE
- `/api/scenarios/:scenarioId/allocations` - GET
- `/api/allocations` - POST; `/api/allocations/:id` - PATCH, DELETE
- `/api/scenarios/:scenarioId/conflicts` - GET (computed conflict detection)
