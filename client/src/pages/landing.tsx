import { Button } from "@/components/ui/button";
import { Truck, BarChart3, Calendar, Shield, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <span className="text-xl font-semibold tracking-tight">SandPlan</span>
          </div>
          <p className="text-white/50 text-sm">Sand Hauling Logistics Planner</p>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-serif font-bold leading-tight">
            Plan. Allocate.<br />
            Execute.
          </h1>
          <p className="text-lg text-white/70 max-w-md leading-relaxed">
            Visualize fleet allocations across multiple fracs with interactive Gantt scheduling and daily allocation grids. Rapid replans when operations shift.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="flex items-start gap-3 p-3 rounded-md bg-white/5">
              <Calendar className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Gantt Scheduling</p>
                <p className="text-xs text-white/50">Drag-and-drop frac timelines</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-white/5">
              <BarChart3 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Allocation Grid</p>
                <p className="text-xs text-white/50">Daily truck assignments</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-white/5">
              <Shield className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Conflict Detection</p>
                <p className="text-xs text-white/50">Real-time capacity warnings</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-white/5">
              <Truck className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Fleet Tracking</p>
                <p className="text-xs text-white/50">Hauler capacity & commits</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-white/30 text-xs">&copy; 2026 SandPlan. All rights reserved.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-semibold tracking-tight">SandPlan</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm">
              Sign in to access your fleet planning dashboard and manage sand hauling operations.
            </p>
          </div>

          <a href="/api/login" data-testid="link-login">
            <Button size="lg" className="w-full gap-2">
              Sign in to SandPlan
              <ArrowRight className="w-4 h-4" />
            </Button>
          </a>

          <p className="text-xs text-muted-foreground text-center">
            Secure authentication powered by Replit
          </p>
        </div>
      </div>
    </div>
  );
}
