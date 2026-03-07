FleetSync App Walkthrough Guide

1. Sign in / Sign Up

Open the app. If you're not signed in, you see the landing page (welcome + "Sign in to FleetSync").
Click "Sign in to FleetSync" to go through Replit Auth. From there you can either use Gmail, or email password if you have a login. If not you can also click the sign up and quickly create a user name / password.
After sign-in you land on the main app with the sidebar and the Gantt Schedule (default page).

2. Understand the layout

Sidebar (left)
- Planning: Gantt Schedule, Allocation Grid, Frac Jobs, Haulers, Import.
- Footer: Your avatar (initials-based), name, email, and a Logout icon.

Header: Page title and main actions (scenario selector, Add Job, Lanes, etc.).
Main area: Content for the current page (dashboard, grid, frac jobs, or haulers).

Important: The scenario dropdown (e.g. "Actual Schedule") in the header is shared: lanes and frac jobs are global, but schedules and allocations are per scenario. Always note which scenario is selected.

3. Pick a scenario (and optional sandbox)

Use the scenario dropdown next to the page title to switch between scenarios (Actual, Sandbox, etc.).
To try changes without touching the real plan:
- Select the scenario you want to copy (e.g. Actual Schedule).
- Click "Sandbox".
- Optionally enter a name, then "Create Sandbox".
- You're now on the new sandbox; edit there freely.

4. Gantt Schedule (Dashboard -- default page)

Path: Sidebar > Gantt Schedule.
Top: Scenario selector, conflict badges (if any), Lanes, Add Job.

Gantt section (collapsible):
- Lanes (e.g. EVO1, EVO10) with frac bars on a timeline.
- Zoom: Week / Month / Quarter / Year; view scrolls to "today" when you change zoom.
- Interactions: Drag a bar to move start/end together; drag left/right edge to change start or end only. (Disabled if scenario is locked.)
- Amber dots on bars = days that have journal entries. Hover over a bar to see how many days have journal notes in the tooltip.
- Click a frac bar to open the Frac Detail panel (sand info, demand, allocations, journal).
- Splitter: Drag the horizontal bar between Gantt and grid to resize (e.g. 20-80%).

Allocation Grid section (collapsible): Same grid as the Allocation Grid page but tied to the dashboard date range and selected date.

Suggested demo: Change zoom, drag a bar, click a bar to open the detail panel, then resize the splitter.

5. Frac Detail panel (from Gantt)

Open: From the Gantt, click a frac bar.
Content: Sand info, demand/truck recommendation (step-by-step math), hauler assignments, truck overrides (date-segmented "effective trucks"), and daily journal (NPT, mechanical, weather, etc.) with hours lost and notes.
Actions: Edit frac (if allowed), clone, add/edit journal entries.

Suggested demo: Open a frac, walk through the demand breakdown, add a journal entry, then show the amber dot on the Gantt for that day.

6. Allocation Grid (daily truck assignments)

Path: Sidebar > Allocation Grid.

Rows: One section per frac (pad name, "Needs X" trucks). Under each frac, one row per hauler.
Columns: Dates (number of days auto-adjusts to window width).

Cell colors:
- Green (emerald) = assigned trucks exactly match required demand.
- Amber = off by exactly 1 truck (slightly over or under).
- Red = off by more than 1 truck, or no trucks assigned when demand exists.

Footer rows:
- Hauler Totals: Sum of all hauler allocations per day. If there's a shortfall vs frac needs, the delta is shown in red.
- Frac Needs Total: Sum of required trucks across all active, planned, and complete frac schedules per day. Shortfalls are highlighted in red. This is a key visual indicator for daily fleet demand.

Toolbar: Scenario selector, date navigation (left/right arrows), Export CSV, and conflict/issue indicators.

Editing:
- Add allocation: On a frac section header, click the + button to open the Allocation dialog: choose hauler, date range, trucks/shift. Save. (Over-capacity may show a confirmation warning; you can accept to proceed or cancel.)
- Edit existing: Click a cell (hauler x date), type a number, Enter or Tab to save. Click away to cancel. Multi-day blocks are split automatically when you change one day.

Suggested demo: Add an allocation for a frac, then change a cell and confirm it updates and conflicts refresh.

7. Frac Jobs (define and schedule fracs)

Path: Sidebar > Frac Jobs.
Top: Scenario selector, New Frac Job.

List: Cards per frac (pad name, lane, customer, basin, sand plan summary). Each card: Edit, Clone, Add schedule or Edit schedule (for the current scenario).

Create a frac:
New Frac Job > form: Pad name, Lane, Customer, Basin, sand plan (stages/day, tons/stage, travel time, load/unload, storage type/capacity, etc.). Use presets for storage type and sand design if available. Save.

If you're on the dashboard and use Add Job there, after saving the frac you get a Schedule dialog to set start/end dates and trucks/shift for the current scenario (or Skip to schedule later from Frac Jobs).

Schedule a frac (this scenario):
On a card, "Add schedule" (or "Edit schedule") > set start date, end date, trucks per shift, transition days, status (planned/active/paused/complete). Save.

Clone a frac:
Clone on a card > pre-filled form with "(Copy)" in the name; adjust and save. You can add a schedule in the same flow.

Sandbox note: In a sandbox, "delete" only removes that frac from the sandbox (schedule/allocations), not the global frac job. The Edit button for global frac fields is hidden in sandbox mode.

Suggested demo: Create a frac (with a preset), add a schedule, then clone it and optionally schedule the clone.

8. Haulers (trucking companies and capacity)

Path: Sidebar > Haulers.
Tabs: Hauler List | Capacity View.

Hauler List: Cards with name, max trucks/shift, min commitment, "Split OK" badge if they can serve multiple fracs, "Today: X assigned." Add Hauler, Edit, Delete.

Capacity View: A 14-day rolling grid of haulers x dates showing assigned trucks vs capacity. Navigate with Previous 7 / Today / Next 7 buttons. Over-capacity cells are highlighted in red; under-commitment cells are highlighted in amber.

Add/edit hauler: Name, split allowed, home area, max/min trucks per shift, notes. Capacity exceptions (per-day overrides) exist in the data model for future use but do not have a dedicated management UI yet.

Suggested demo: Add a hauler, set max trucks, then in the Allocation Grid assign that hauler over capacity and show the warning/confirmation dialog.

9. Lanes (group fracs)

Path: From the Gantt Schedule page > Lanes button.
Manage Lanes sheet: list of lanes (name, color). New Lane, Edit (rename, color, sort), Delete.
Lanes group fracs on the Gantt and in the grid. Lane cascading: On the Gantt, extending a frac's end date can push downstream fracs in the same lane.

Suggested demo: Create or edit a lane, then create a frac in that lane and show it on the Gantt.

10. Conflicts and issues

Where: Dashboard shows badges when there are issues (e.g. "X day(s) with issues" in red, "X warning(s)" in gray). Click a badge to open the Issues & Warnings sheet.

Types:
- Hard issues (red): Under-supplied fracs, hauler over-capacity.
- Warnings (amber/gray): Over-supplied fracs, hauler split warnings (hauler assigned to multiple fracs but split not allowed).

Sheet: Grouped by type, then by entity. Consecutive dates are consolidated into ranges (e.g. "3/1 - 3/5 (5d)") to reduce noise. Expand/collapse each group. Dismiss per entity or "Dismiss all" per type. "Show dismissed" toggle to see or restore dismissed items.

Suggested demo: Create an over-capacity or under-supplied case in the grid, open the sheet, dismiss one item, then restore it.

11. Export

CSV: On the Allocation Grid page, click Export CSV to download a CSV of the full grid. The export includes all hauler allocation data plus Hauler Totals and Frac Needs Total summary rows at the bottom.

12. Sand Planning import

You can import planning dates and sand inputs from a CSV export of your Sand Planning sheet (e.g. "Sand Planning.xlsx"). This updates or creates frac jobs and schedules in a scenario; the Allocation Grid and Gantt then reflect the new dates and requirements. Allocations are not changed by import.

How to export:
- Export the Sand Planning sheet to CSV from Excel or your spreadsheet tool (Save As or Export as CSV). Column names can vary; the import maps common synonyms (pad name, start/end dates, stages per day, tons per stage, lane, etc.).

How to import:
- Open the Import page from the sidebar.
- Optionally select a scenario in the header (or leave the default to use or create a "Baseline Plan" scenario).
- Choose a CSV file and click Import.
- Review the result summary (rows processed, frac jobs and schedules created or updated, skipped rows) and any warnings.

After import:
- The Allocation Grid and Gantt Schedule show the updated schedules and requirements for the chosen scenario. Frac Jobs lists the imported fracs. Allocations remain manual.

Manual test checklist:
1. Export Sand Planning sheet to CSV.
2. Import into Baseline scenario (or create Baseline Plan if none).
3. Verify frac jobs created/updated and visible (e.g. Frac Jobs page).
4. Verify schedules appear in the Allocation Grid date range.
5. Change one row's end date in the CSV to extend; re-import; verify downstream fracs in the same lane are pushed right (cascade).
6. Re-import the same CSV; verify no duplicates (updates only).
7. Import a CSV with one row missing padName; verify that row is skipped and a warning is shown.
