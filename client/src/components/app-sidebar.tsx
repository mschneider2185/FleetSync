import { useLocation, Link } from "wouter";
import { Activity, BarChart3, Calendar, Truck, HardHat, FileUp, LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { title: "Gantt Schedule", url: "/", icon: Calendar },
  { title: "Allocation Grid", url: "/allocation-grid", icon: BarChart3 },
  { title: "Frac Jobs", url: "/frac-jobs", icon: HardHat },
  { title: "Haulers", url: "/haulers", icon: Truck },
  { title: "Import", url: "/import", icon: FileUp },
  { title: "Sand Actuals", url: "/sand-actuals", icon: Activity },
];

function LogoMark() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
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
          fontSize: 13,
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
          bottom: 5,
          left: 5,
          width: 10,
          height: 2,
          borderRadius: 2,
          background: "var(--fs-magenta)",
        }}
      />
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.5, color: "hsl(var(--sidebar-foreground))", lineHeight: 1.2 }}>
              Fleet<span style={{ color: "var(--fs-magenta)" }}>S</span>ync
            </p>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "2.5px", color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
              Operations platform
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Planning</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="text-xs">
                {(user.firstName?.[0] || '') + (user.lastName?.[0] || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <a href="/api/logout" data-testid="button-logout">
              <Button size="icon" variant="ghost">
                <LogOut className="w-4 h-4" />
              </Button>
            </a>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
