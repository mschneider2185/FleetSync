import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────
   FleetSync Landing Page
   Follows BRANDING.md design system specifications
   ───────────────────────────────────────────── */

// ── Icon components (Lucide-style, stroke-based) ──

const icons = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  gantt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 4 4-6" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2.7l1.7 5.3h5.6l-4.5 3.3 1.7 5.3L12 13.3l-4.5 3.3 1.7-5.3L4.7 8h5.6z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
};

// ── Logo mark component ──

function LogoMark({ size = 40 }: { size?: number }) {
  const barW = size * 0.3;
  const barH = size * 0.075;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: "var(--fs-navy-mid)",
        border: "0.5px solid var(--fs-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--fs-font-body)",
          fontSize: size * 0.4,
          fontWeight: 700,
          color: "white",
          letterSpacing: -0.5,
        }}
      >
        FS
      </span>
      <span
        style={{
          position: "absolute",
          bottom: size * 0.15,
          left: size * 0.15,
          width: barW,
          height: barH,
          borderRadius: 2,
          background: "var(--fs-magenta)",
        }}
      />
    </div>
  );
}

// ── EQT wordmark component ──

function EQTWordmark({
  size = 28,
  color = "white",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--fs-font-body)",
        fontSize: size,
        fontWeight: 800,
        color,
        letterSpacing: -1,
        flexShrink: 0,
      }}
    >
      E<span style={{ color: "var(--fs-magenta)" }}>Q</span>T
    </span>
  );
}

// ── FleetSync wordmark component ──

function FleetSyncWordmark({
  size = 20,
  weight = 600,
}: {
  size?: number;
  weight?: number;
}) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -0.5,
        color: "white",
      }}
    >
      Fleet<span style={{ color: "var(--fs-magenta)" }}>S</span>ync
    </span>
  );
}

// ── Chart bar animation hook ──

function useAnimatedBars() {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 400);
    return () => clearTimeout(t);
  }, []);
  return animate;
}

// ── Main landing page component ──

export default function Landing() {
  const animate = useAnimatedBars();

  const stats = [
    { value: "193", label: "Loads tracked today" },
    { value: "4,937", label: "Tons delivered" },
    { value: "3", label: "Active frac crews" },
    { value: "98.2", label: "On-time delivery", suffix: "%" },
  ];

  const modules = [
    {
      icon: "gantt",
      color: "pink" as const,
      title: "Gantt scheduler",
      desc: "Drag-and-drop frac scheduling with lane management, conflict detection, and automatic cascade logic.",
      status: "live" as const,
      hoverColor: "var(--fs-magenta)",
    },
    {
      icon: "chart",
      color: "pink" as const,
      title: "Allocation grid",
      desc: "Daily truck assignments with inline editing, drag-to-fill, hauler totals, surplus tracking, and shortfall highlights.",
      status: "live" as const,
      hoverColor: "var(--fs-magenta)",
    },
    {
      icon: "star",
      color: "teal" as const,
      title: "Hauler scorecard",
      desc: "Safety, service, and cost metrics with composite rankings, minimum thresholds, and transparent weighting.",
      status: "building" as const,
      hoverColor: "var(--fs-teal)",
    },
    {
      icon: "clock",
      color: "teal" as const,
      title: "Water module",
      desc: "Executive dashboard, frac supply board, CWF inventory, movement ledger, and produced water routing.",
      status: "building" as const,
      hoverColor: "var(--fs-teal)",
    },
    {
      icon: "doc",
      color: "blue" as const,
      title: "Daily journal",
      desc: "NPT tracking with sub-categories — mechanical, weather, water limitation, sand supply, truck shortage, SWA.",
      status: "live" as const,
      hoverColor: "var(--fs-blue-bright)",
    },
    {
      icon: "download",
      color: "blue" as const,
      title: "Export and integration",
      desc: "CSV and Excel exports, per-frac detailed reports, publish/export audit trail, and Gemini-compatible output.",
      status: "live" as const,
      hoverColor: "var(--fs-blue-bright)",
    },
  ];

  const sidebarItems = [
    { icon: "grid", label: "Dashboard", active: true },
    { icon: "gantt", label: "Gantt", active: false },
    { icon: "chart", label: "Allocations", active: false },
    { icon: "clock", label: "Water", active: false },
    { icon: "doc", label: "Journal", active: false },
    { icon: "star", label: "Scorecard", active: false },
  ];

  const kpis = [
    { label: "Loads", value: "193", delta: "+12 vs yesterday", up: true },
    { label: "Tonnage", value: "4,937", delta: "+340t", up: true },
    { label: "Conflicts", value: "2", delta: "+1 new", up: false },
    { label: "Surplus", value: "+8", delta: "Balanced", up: true },
  ];

  const chartData = [
    { c: 72, d: 65, s: 7 },
    { c: 68, d: 72, s: 4 },
    { c: 75, d: 58, s: 0 },
    { c: 70, d: 80, s: 10 },
    { c: 78, d: 75, s: 0 },
    { c: 65, d: 68, s: 3 },
    { c: 80, d: 82, s: 8 },
  ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const maxVal = 82;

  return (
    <>
      <style>{brandCSS}</style>
      <div className="fs-page">
        {/* ── Navigation ── */}
        <nav className="fs-nav">
          <div className="fs-logo-group">
            <LogoMark />
            <div>
              <FleetSyncWordmark />
              <div className="fs-logo-sub">Operations platform</div>
            </div>
          </div>
          <ul className="fs-nav-links">
            <li><a href="#">Sand hauling</a></li>
            <li><a href="#">Water module</a></li>
            <li><a href="#">Analytics</a></li>
            <li><a href="#">Docs</a></li>
            <li>
              <a href="/api/login" className="fs-nav-cta">
                Sign in →
              </a>
            </li>
          </ul>
        </nav>

        {/* ── Hero ── */}
        <section className="fs-hero">
          <div className="fs-hero-grid" />
          <div className="fs-hero-glow-pink" />
          <div className="fs-hero-glow-blue" />
          <div className="fs-hero-content">
            <div className="fs-hero-badge">
              <span className="fs-hero-badge-dot" />
              Phase 1 Water Module in development
            </div>
            <h1>
              Plan. Allocate.
              <br />
              <span className="accent">Execute</span>
              <span className="accent-blue">.</span>
            </h1>
            <p className="fs-hero-desc">
              The unified operations platform for sand hauling logistics, water
              management, and fleet allocation across your completions program.
              Built for the field. Trusted by leadership.
            </p>
            <div className="fs-hero-actions">
              <a href="/api/login" className="fs-btn-primary">
                Open dashboard{" "}
                <span style={{ fontSize: 16 }}>→</span>
              </a>
              <a href="#modules" className="fs-btn-secondary">
                View documentation
              </a>
            </div>
          </div>
        </section>

        {/* ── EQT co-brand strip ── */}
        <div className="fs-eqt-strip">
          <EQTWordmark />
          <div className="fs-eqt-strip-text">
            <strong>Powered by EQT Corporation</strong>
            <br />
            America's largest natural gas producer — scale, reliability, and
            operational excellence.
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="fs-stats-bar">
          {stats.map((s, i) => (
            <div className="fs-stat" key={i}>
              <div className="fs-stat-num">
                {s.value}
                {s.suffix && (
                  <span
                    style={{
                      fontFamily: "var(--fs-font-body)",
                      fontSize: 16,
                      color: "var(--fs-text-muted)",
                    }}
                  >
                    {s.suffix}
                  </span>
                )}
              </div>
              <div className="fs-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Modules grid ── */}
        <section className="fs-modules" id="modules">
          <div className="fs-section-label">Platform modules</div>
          <h2 className="fs-section-title">
            Every operations surface, one system of record
          </h2>
          <div className="fs-module-grid">
            {modules.map((m, i) => (
              <ModuleCard key={i} {...m} />
            ))}
          </div>
        </section>

        {/* ── App preview ── */}
        <section className="fs-preview">
          <div className="fs-section-label">Application preview</div>
          <h2 className="fs-section-title" style={{ marginBottom: "2rem" }}>
            Built for ops, designed for leadership
          </h2>
          <div className="fs-preview-container">
            <div className="fs-preview-header">
              <span className="fs-preview-dot r" />
              <span className="fs-preview-dot y" />
              <span className="fs-preview-dot g" />
              <span className="fs-preview-url">
                app.fleetsync.eqt.com / executive-dashboard
              </span>
            </div>
            <div className="fs-preview-body">
              {/* Sidebar */}
              <div className="fs-preview-sidebar">
                <div className="fs-preview-sidebar-logo">
                  <LogoMark size={28} />
                  <FleetSyncWordmark size={14} />
                </div>
                {sidebarItems.map((item, i) => (
                  <div
                    key={i}
                    className={`fs-preview-sidebar-item${item.active ? " active" : ""}`}
                  >
                    <span style={{ width: 16, height: 16, display: "flex" }}>
                      {icons[item.icon as keyof typeof icons]}
                    </span>
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="fs-preview-main">
                <div className="fs-preview-topbar">
                  <div className="fs-preview-topbar-title">
                    Executive dashboard
                  </div>
                  <div className="fs-preview-topbar-filters">
                    {["Baseline", "Forecast", "Actual"].map((f, i) => (
                      <span
                        key={f}
                        className={`fs-preview-filter-pill${i === 0 ? " active" : ""}`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="fs-preview-kpi-row">
                  {kpis.map((k, i) => (
                    <div className="fs-preview-kpi" key={i}>
                      <div className="fs-preview-kpi-label">{k.label}</div>
                      <div className="fs-preview-kpi-val">{k.value}</div>
                      <div className={`fs-preview-kpi-delta ${k.up ? "up" : "dn"}`}>
                        {k.delta}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fs-preview-chart">
                  <div className="fs-preview-chart-header">
                    <div className="fs-preview-chart-title">
                      7-day delivery trend
                    </div>
                    <div className="fs-preview-chart-legend">
                      {[
                        { color: "var(--fs-magenta)", label: "Committed" },
                        { color: "var(--fs-blue)", label: "Delivered" },
                        { color: "var(--fs-teal)", label: "Surplus" },
                      ].map((l) => (
                        <div className="fs-legend-item" key={l.label}>
                          <div
                            className="fs-legend-dot"
                            style={{ background: l.color }}
                          />
                          {l.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="fs-chart-bars">
                    {chartData.map((d, i) => (
                      <div className="fs-chart-col-wrap" key={i}>
                        <div className="fs-chart-col">
                          <div
                            className="fs-chart-bar"
                            style={{
                              background: "var(--fs-magenta)",
                              opacity: 0.5,
                              height: animate
                                ? `${Math.round((d.c / maxVal) * 65)}px`
                                : "0px",
                              transitionDelay: `${i * 100}ms`,
                            }}
                          />
                          <div
                            className="fs-chart-bar"
                            style={{
                              background: "var(--fs-blue)",
                              height: animate
                                ? `${Math.round((d.d / maxVal) * 65)}px`
                                : "0px",
                              transitionDelay: `${i * 100 + 40}ms`,
                            }}
                          />
                          <div
                            className="fs-chart-bar"
                            style={{
                              background: "var(--fs-teal)",
                              opacity: 0.6,
                              height: animate
                                ? `${Math.max(4, Math.round((d.s / maxVal) * 65))}px`
                                : "0px",
                              transitionDelay: `${i * 100 + 80}ms`,
                            }}
                          />
                        </div>
                        <div className="fs-chart-day-label">{days[i]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Integrations ── */}
        <div className="fs-powered">
          <div className="fs-powered-label">Integrated with</div>
          <div className="fs-powered-logos">
            {["Databricks", "Gemini Tickets", "Glancer", "Jarvis BI"].map(
              (name) => (
                <span className="fs-powered-item" key={name}>
                  {name}
                </span>
              )
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="fs-footer">
          <div className="fs-footer-left">
            <FleetSyncWordmark size={14} weight={600} />
            <span className="fs-footer-sep" />
            <EQTWordmark size={14} color="var(--fs-text-muted)" />
          </div>
          <div className="fs-footer-right">
            &copy; 2026 EQT Corporation. All rights reserved.
          </div>
        </footer>
      </div>
    </>
  );
}

// ── Module card with hover animation ──

function ModuleCard({
  icon,
  color,
  title,
  desc,
  status,
  hoverColor,
}: {
  icon: string;
  color: "pink" | "teal" | "blue";
  title: string;
  desc: string;
  status: "live" | "building" | "planned";
  hoverColor: string;
}) {
  const [hovered, setHovered] = useState(false);

  const statusMap = {
    live: { bg: "rgba(29,158,117,0.15)", text: "var(--fs-teal-light)" },
    building: {
      bg: "var(--fs-magenta-glow)",
      text: "var(--fs-magenta-bright)",
    },
    planned: { bg: "rgba(138,153,180,0.15)", text: "var(--fs-text-muted)" },
  };

  return (
    <div
      className="fs-module-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 2,
          width: hovered ? "100%" : "0%",
          background: hoverColor,
          transition: "width 0.4s",
        }}
      />
      <div className={`fs-module-icon ${color}`}>
        <span style={{ width: 20, height: 20, display: "flex" }}>
          {icons[icon as keyof typeof icons]}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <span
        style={{
          display: "inline-block",
          marginTop: "1rem",
          padding: "3px 10px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          background: statusMap[status].bg,
          color: statusMap[status].text,
        }}
      >
        {status}
      </span>
    </div>
  );
}

// ── All CSS as a single string (references BRANDING.md variables) ──

const brandCSS = `
:root {
  --fs-navy: #0a1628;
  --fs-navy-mid: #152238;
  --fs-slate: #1e2d45;
  --fs-blue: #185FA5;
  --fs-blue-bright: #378ADD;
  --fs-blue-glow: #85B7EB;
  --fs-magenta: #E91E78;
  --fs-magenta-bright: #FF3D94;
  --fs-magenta-deep: #C4105F;
  --fs-magenta-glow: rgba(233,30,120,0.15);
  --fs-teal: #1D9E75;
  --fs-teal-light: #5DCAA5;
  --fs-amber: #EF9F27;
  --fs-amber-dark: #BA7517;
  --fs-red: #E24B4A;
  --fs-text: #E8ECF2;
  --fs-text-muted: #8A99B4;
  --fs-border: rgba(255,255,255,0.08);
  --fs-border-hover: rgba(255,255,255,0.15);
  --fs-border-active: rgba(255,255,255,0.30);
  --fs-surface: rgba(255,255,255,0.04);
  --fs-font-display: 'DM Serif Display', Georgia, serif;
  --fs-font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --fs-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

.fs-page {
  font-family: var(--fs-font-body);
  background: var(--fs-navy);
  color: var(--fs-text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* ── Nav ── */
.fs-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 2.5rem;
  border-bottom: 0.5px solid var(--fs-border);
  position: relative; z-index: 10;
}
.fs-logo-group { display: flex; align-items: center; gap: 14px; }
.fs-logo-sub {
  font-size: 10px; text-transform: uppercase; letter-spacing: 2.5px;
  color: var(--fs-text-muted); margin-top: 1px;
}
.fs-nav-links {
  display: flex; align-items: center; gap: 2rem; list-style: none;
}
.fs-nav-links a {
  font-size: 13px; font-weight: 500; color: var(--fs-text-muted);
  text-decoration: none; letter-spacing: 0.3px; transition: color 0.2s;
}
.fs-nav-links a:hover { color: white; }
.fs-nav-cta {
  background: var(--fs-magenta) !important; color: white !important;
  padding: 8px 20px; border-radius: 6px; font-weight: 600;
  transition: background 0.2s;
}
.fs-nav-cta:hover { background: var(--fs-magenta-bright) !important; }

/* ── Hero ── */
.fs-hero {
  position: relative; padding: 6rem 2.5rem 5rem; overflow: hidden;
}
.fs-hero-grid {
  position: absolute; inset: 0; opacity: 0.03;
  background-image:
    linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
  background-size: 60px 60px;
}
.fs-hero-glow-pink {
  position: absolute; top: -60px; right: 120px; width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(233,30,120,0.08) 0%, transparent 70%);
  pointer-events: none;
}
.fs-hero-glow-blue {
  position: absolute; bottom: -100px; left: -50px; width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(24,95,165,0.12) 0%, transparent 70%);
  pointer-events: none;
}
.fs-hero-content { position: relative; max-width: 720px; }
.fs-hero-badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px; border-radius: 20px;
  border: 0.5px solid rgba(233,30,120,0.25);
  background: var(--fs-magenta-glow);
  font-size: 12px; color: var(--fs-magenta-bright);
  font-weight: 500; letter-spacing: 0.5px; margin-bottom: 2rem;
}
.fs-hero-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--fs-magenta);
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.fs-hero h1 {
  font-family: var(--fs-font-display); font-size: 54px; font-weight: 400;
  line-height: 1.08; letter-spacing: -1px; margin-bottom: 1.5rem; color: white;
}
.fs-hero h1 .accent { color: var(--fs-magenta); }
.fs-hero h1 .accent-blue { color: var(--fs-blue-glow); }
.fs-hero-desc {
  font-size: 17px; line-height: 1.7; color: var(--fs-text-muted);
  max-width: 560px; margin-bottom: 2.5rem;
}
.fs-hero-actions { display: flex; gap: 12px; align-items: center; }

/* ── Buttons ── */
.fs-btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 13px 30px; border-radius: 8px;
  background: var(--fs-magenta); color: white;
  font-size: 14px; font-weight: 600; border: none;
  cursor: pointer; transition: all 0.2s; text-decoration: none;
}
.fs-btn-primary:hover { background: var(--fs-magenta-bright); transform: translateY(-1px); }
.fs-btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 13px 28px; border-radius: 8px;
  background: transparent; color: var(--fs-text);
  font-size: 14px; font-weight: 500;
  border: 0.5px solid var(--fs-border-hover);
  cursor: pointer; transition: all 0.2s; text-decoration: none;
}
.fs-btn-secondary:hover {
  border-color: var(--fs-border-active); background: var(--fs-surface);
}

/* ── EQT strip ── */
.fs-eqt-strip {
  margin: 4rem 2.5rem 0; padding: 1.5rem 2rem;
  border: 0.5px solid var(--fs-border); border-radius: 10px;
  background: var(--fs-surface);
  display: flex; align-items: center; gap: 20px;
}
.fs-eqt-strip-text {
  font-size: 13px; color: var(--fs-text-muted); line-height: 1.5;
  border-left: 0.5px solid var(--fs-border); padding-left: 20px;
}
.fs-eqt-strip-text strong { color: var(--fs-text); font-weight: 600; }

/* ── Stats bar ── */
.fs-stats-bar {
  display: flex; gap: 0; margin: 2.5rem 2.5rem 0;
  border-top: 0.5px solid var(--fs-border);
  border-bottom: 0.5px solid var(--fs-border);
}
.fs-stat {
  flex: 1; padding: 1.5rem 0; text-align: center;
  border-right: 0.5px solid var(--fs-border);
}
.fs-stat:last-child { border-right: none; }
.fs-stat-num {
  font-family: var(--fs-font-display); font-size: 32px;
  color: white; margin-bottom: 4px;
}
.fs-stat-label {
  font-size: 12px; color: var(--fs-text-muted);
  text-transform: uppercase; letter-spacing: 1.5px;
}

/* ── Modules ── */
.fs-modules { padding: 5rem 2.5rem; }
.fs-section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
  color: var(--fs-magenta); font-weight: 600; margin-bottom: 1rem;
}
.fs-section-title {
  font-family: var(--fs-font-display); font-size: 36px;
  color: white; margin-bottom: 3rem; max-width: 480px; line-height: 1.2;
}
.fs-module-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 1px; background: var(--fs-border);
  border: 0.5px solid var(--fs-border); border-radius: 12px;
  overflow: hidden;
}
.fs-module-card {
  background: var(--fs-navy); padding: 2rem;
  transition: background 0.3s; cursor: default; position: relative;
}
.fs-module-card:hover { background: var(--fs-navy-mid); }
.fs-module-icon {
  width: 40px; height: 40px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 1.25rem;
}
.fs-module-icon.pink { background: var(--fs-magenta-glow); color: var(--fs-magenta-bright); }
.fs-module-icon.teal { background: rgba(29,158,117,0.15); color: var(--fs-teal-light); }
.fs-module-icon.blue { background: rgba(24,95,165,0.2); color: var(--fs-blue-glow); }
.fs-module-card h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: white; }
.fs-module-card p { font-size: 13px; line-height: 1.6; color: var(--fs-text-muted); }

/* ── Preview ── */
.fs-preview { padding: 0 2.5rem 5rem; }
.fs-preview-container {
  border: 0.5px solid var(--fs-border); border-radius: 12px;
  overflow: hidden; background: var(--fs-navy-mid);
}
.fs-preview-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-bottom: 0.5px solid var(--fs-border);
  background: rgba(0,0,0,0.2);
}
.fs-preview-dot { width: 10px; height: 10px; border-radius: 50%; }
.fs-preview-dot.r { background: var(--fs-magenta); }
.fs-preview-dot.y { background: var(--fs-amber); }
.fs-preview-dot.g { background: var(--fs-teal); }
.fs-preview-url {
  flex: 1; text-align: center; font-size: 12px;
  color: var(--fs-text-muted); font-family: var(--fs-font-mono);
}
.fs-preview-body {
  padding: 1.5rem; display: grid;
  grid-template-columns: 200px 1fr; gap: 1px; min-height: 340px;
}
.fs-preview-sidebar {
  padding-right: 1.5rem; border-right: 0.5px solid var(--fs-border);
}
.fs-preview-sidebar-logo {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; margin-bottom: 16px;
}
.fs-preview-sidebar-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 6px;
  font-size: 13px; color: var(--fs-text-muted);
  margin-bottom: 2px; cursor: default; transition: all 0.15s;
}
.fs-preview-sidebar-item.active {
  background: var(--fs-magenta-glow); color: var(--fs-magenta-bright);
}
.fs-preview-sidebar-item svg { width: 16px; height: 16px; opacity: 0.6; }
.fs-preview-sidebar-item.active svg { opacity: 1; }
.fs-preview-main { padding-left: 1.5rem; }
.fs-preview-topbar {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.25rem; padding-bottom: 12px;
  border-bottom: 0.5px solid var(--fs-border);
}
.fs-preview-topbar-title { font-size: 16px; font-weight: 600; color: white; }
.fs-preview-topbar-filters { display: flex; gap: 6px; }
.fs-preview-filter-pill {
  padding: 4px 12px; border-radius: 4px; font-size: 11px;
  border: 0.5px solid var(--fs-border);
  color: var(--fs-text-muted); background: transparent;
}
.fs-preview-filter-pill.active {
  border-color: var(--fs-magenta); color: var(--fs-magenta-bright);
  background: var(--fs-magenta-glow);
}
.fs-preview-kpi-row {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-bottom: 1.25rem;
}
.fs-preview-kpi {
  background: rgba(255,255,255,0.03);
  border: 0.5px solid var(--fs-border); border-radius: 8px;
  padding: 12px 14px;
}
.fs-preview-kpi-label {
  font-size: 10px; color: var(--fs-text-muted);
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;
}
.fs-preview-kpi-val {
  font-family: var(--fs-font-display); font-size: 22px; color: white;
}
.fs-preview-kpi-delta { font-size: 11px; margin-top: 3px; }
.fs-preview-kpi-delta.up { color: var(--fs-teal-light); }
.fs-preview-kpi-delta.dn { color: var(--fs-magenta); }
.fs-preview-chart {
  background: rgba(255,255,255,0.02);
  border: 0.5px solid var(--fs-border); border-radius: 8px;
  padding: 1rem 1.25rem; height: 140px;
  position: relative; overflow: hidden;
}
.fs-preview-chart-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.fs-preview-chart-title { font-size: 12px; color: var(--fs-text-muted); }
.fs-preview-chart-legend { display: flex; gap: 12px; }
.fs-legend-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; color: var(--fs-text-muted);
}
.fs-legend-dot { width: 8px; height: 8px; border-radius: 2px; }
.fs-chart-bars {
  display: flex; align-items: flex-end; gap: 4px; height: 85px;
}
.fs-chart-col-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center;
}
.fs-chart-col {
  width: 100%; display: flex; gap: 2px; align-items: flex-end; height: 70px;
}
.fs-chart-bar {
  flex: 1; border-radius: 2px 2px 0 0;
  transition: height 0.8s cubic-bezier(0.23, 1, 0.32, 1);
}
.fs-chart-day-label {
  font-size: 10px; color: var(--fs-text-muted);
  margin-top: 6px; text-align: center;
}

/* ── Powered by ── */
.fs-powered {
  padding: 2rem 2.5rem 3rem; display: flex;
  align-items: center; gap: 3rem;
  border-top: 0.5px solid var(--fs-border);
}
.fs-powered-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 2px;
  color: var(--fs-text-muted); white-space: nowrap;
}
.fs-powered-logos {
  display: flex; align-items: center; gap: 2.5rem; flex: 1;
}
.fs-powered-item {
  font-size: 13px; font-weight: 500;
  color: rgba(138,153,180,0.4); letter-spacing: 0.5px;
}

/* ── Footer ── */
.fs-footer {
  padding: 2rem 2.5rem;
  border-top: 0.5px solid var(--fs-border);
  display: flex; align-items: center; justify-content: space-between;
}
.fs-footer-left { display: flex; align-items: center; gap: 16px; }
.fs-footer-sep {
  width: 1px; height: 16px; background: rgba(255,255,255,0.1);
}
.fs-footer-right { font-size: 12px; color: rgba(138,153,180,0.5); }

/* ── Responsive ── */
@media (max-width: 1199px) {
  .fs-module-grid { grid-template-columns: repeat(2, 1fr); }
  .fs-preview-body { grid-template-columns: 1fr; }
  .fs-preview-sidebar {
    border-right: none; border-bottom: 0.5px solid var(--fs-border);
    padding-right: 0; padding-bottom: 1rem; margin-bottom: 1rem;
    display: flex; flex-wrap: wrap; gap: 4px;
  }
  .fs-preview-sidebar-logo { width: 100%; }
}
@media (max-width: 767px) {
  .fs-nav { flex-direction: column; gap: 1rem; padding: 1rem 1.5rem; }
  .fs-nav-links { flex-wrap: wrap; justify-content: center; gap: 1rem; }
  .fs-hero { padding: 3rem 1.5rem; }
  .fs-hero h1 { font-size: 36px; }
  .fs-hero-desc { font-size: 15px; }
  .fs-hero-actions { flex-direction: column; }
  .fs-stats-bar { flex-wrap: wrap; margin: 2rem 1.5rem 0; }
  .fs-stat { flex: 1 1 50%; border-bottom: 0.5px solid var(--fs-border); }
  .fs-modules { padding: 3rem 1.5rem; }
  .fs-module-grid { grid-template-columns: 1fr; }
  .fs-section-title { font-size: 28px; }
  .fs-preview { padding: 0 1.5rem 3rem; }
  .fs-preview-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .fs-eqt-strip { margin: 2rem 1.5rem 0; flex-direction: column; text-align: center; }
  .fs-eqt-strip-text { border-left: none; padding-left: 0; border-top: 0.5px solid var(--fs-border); padding-top: 12px; }
  .fs-powered { flex-direction: column; gap: 1rem; padding: 1.5rem; }
  .fs-footer { flex-direction: column; gap: 1rem; text-align: center; padding: 1.5rem; }
}
`;
