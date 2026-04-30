import { useEffect, useState } from "react";
import { Suspense, lazy } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Copy,
  Globe,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Plug,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Sun,
  Terminal,
  UserRound,
  Users,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { getLogs, type LogData } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const coreNavigation: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Zones", href: "/zones", icon: Globe },
  { label: "Configuration", href: "/config", icon: Settings },
  { label: "ACLs & Keys", href: "/acls", icon: Shield },
  { label: "Logs", href: "/logs", icon: Terminal },
  { label: "Server Status", href: "/status", icon: Server },
];

const adminOperations: NavItem[] = [
  { label: "Connections", href: "/connections", icon: Plug },
  { label: "Replication", href: "/replication", icon: Copy },
  { label: "Users", href: "/users", icon: Users },
];

const adminSecurity: NavItem[] = [
  { label: "Firewall", href: "/firewall", icon: ShieldCheck },
  { label: "DNS Firewall", href: "/firewall-rpz", icon: ShieldAlert },
  { label: "IP Blacklist", href: "/blacklist", icon: ShieldBan },
  { label: "API Tokens", href: "/api-tokens", icon: Key },
];

const LayoutCommandPalette = lazy(async () => {
  const module = await import("./LayoutCommandPalette");
  return { default: module.LayoutCommandPalette };
});

const LayoutNotificationsSheet = lazy(async () => {
  const module = await import("./LayoutNotificationsSheet");
  return { default: module.LayoutNotificationsSheet };
});

const routeLabels: Array<{ match: (path: string) => boolean; label: string }> = [
  { match: (path) => path === "/", label: "Overview" },
  { match: (path) => path === "/zones", label: "Zones" },
  { match: (path) => path.startsWith("/zones/"), label: "Zone Editor" },
  { match: (path) => path === "/config", label: "Configuration" },
  { match: (path) => path === "/logs", label: "Logs" },
  { match: (path) => path === "/acls", label: "ACLs & Keys" },
  { match: (path) => path === "/status", label: "Server Status" },
  { match: (path) => path === "/connections", label: "Connections" },
  { match: (path) => path === "/users", label: "Users" },
  { match: (path) => path === "/firewall", label: "Firewall" },
  { match: (path) => path === "/firewall-rpz", label: "DNS Firewall" },
  { match: (path) => path === "/blacklist", label: "IP Blacklist" },
  { match: (path) => path === "/api-tokens", label: "API Tokens" },
  { match: (path) => path === "/replication", label: "Replication" },
  { match: (path) => path === "/profile", label: "Profile" },
];

function getShortcutLabel() {
  if (typeof navigator === "undefined") {
    return "Ctrl K";
  }

  const platform = navigator.platform.toLowerCase();
  return platform.includes("mac") ? "Cmd K" : "Ctrl K";
}

function isActiveRoute(currentPath: string, href: string) {
  if (href === "/") {
    return currentPath === "/";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function getCurrentRouteLabel(path: string) {
  return routeLabels.find((route) => route.match(path))?.label ?? "Control Panel";
}

function OverlayFallback() {
  return null;
}

function NavButton({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link href={item.href} onClick={onNavigate}>
      <button
        className={[
          "flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-150",
          active
            ? "bg-sidebar-accent/90 text-sidebar-accent-foreground shadow-[inset_0_1px_0_hsl(var(--primary)/0.2),0_10px_30px_hsl(var(--background)/0.18)] ring-1 ring-white/5"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
          collapsed ? "justify-center px-2" : "",
        ].join(" ")}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="h-4.5 w-4.5 shrink-0" />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </button>
    </Link>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const storedCollapsed = localStorage.getItem("sidebarCollapsed");
    if (storedCollapsed !== null) {
      return storedCollapsed === "true";
    }

    return localStorage.getItem("sidebarExpanded") === "false";
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<LogData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const shortcutLabel = getShortcutLabel();
  const currentRouteLabel = getCurrentRouteLabel(location);

  const navSections: NavSection[] = [
    { title: "Overview", items: coreNavigation },
    ...(user?.role === "admin"
      ? [
          { title: "Operations", items: adminOperations },
          { title: "Security", items: adminSecurity },
        ]
      : []),
  ];

  useEffect(() => {
    localStorage.setItem("theme", theme);

    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.classList.remove("dark", "light");
      if (theme === "auto") {
        root.classList.add(media.matches ? "dark" : "light");
        return;
      }
      root.classList.add(theme);
    };

    applyTheme();

    if (theme !== "auto") {
      return;
    }

    const handleChange = () => applyTheme();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
    localStorage.setItem("sidebarExpanded", sidebarCollapsed ? "false" : "true");
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    getLogs({ limit: 5, scope: "app" })
      .then((logs) => {
        setNotifications(logs);
        const lastSeenId = localStorage.getItem("lastSeenLogId");
        const newCount = lastSeenId ? logs.findIndex((log) => log.id === lastSeenId) : logs.length;
        setUnreadCount(newCount === -1 ? logs.length : newCount);
      })
      .catch(console.error);
  }, []);

  const openNotifications = () => {
    setNotifOpen(true);
    setUnreadCount(0);
    if (notifications[0]) {
      localStorage.setItem("lastSeenLogId", notifications[0].id);
    }
  };

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_26%),radial-gradient(circle_at_top_right,hsl(var(--accent)/0.1),transparent_22%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] bg-background text-foreground">
      <aside
        className={[
          "hidden border-r border-sidebar-border/70 bg-sidebar/80 backdrop-blur-xl lg:flex lg:flex-col",
          sidebarCollapsed ? "w-[92px]" : "w-[280px]",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/70 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.82))] text-primary-foreground shadow-[0_18px_50px_hsl(var(--primary)/0.28)]">
              <span className="text-base font-semibold">B</span>
            </div>
            {!sidebarCollapsed ? (
              <div className="min-w-0">
                <div className="truncate text-base font-semibold tracking-[-0.03em] text-sidebar-foreground">
                  BIND9Admin
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/45">
                  DNS Operations
                </div>
              </div>
            ) : null}
          </Link>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-7 px-3 py-4">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-2">
                {!sidebarCollapsed ? (
                  <div className="px-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/42">
                      {section.title}
                    </p>
                  </div>
                ) : null}
                <nav className="space-y-1">
                  {section.items.map((item) => (
                    <NavButton
                      key={item.href}
                      item={item}
                      active={isActiveRoute(location, item.href)}
                      collapsed={sidebarCollapsed}
                    />
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border/70 px-4 py-4">
          {!sidebarCollapsed ? (
            <div className="linear-panel rounded-2xl px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-xs text-primary-foreground">
                    {user?.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user?.username}</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                    {user?.role}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-xs text-primary-foreground">
                  {user?.username?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/78 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-xl text-muted-foreground lg:inline-flex"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/75">
                Control Panel
              </div>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-[-0.03em]">
                  {currentRouteLabel}
                </h2>
                {user?.role ? (
                  <Badge
                    variant="outline"
                    className="hidden border-border/70 bg-background/70 capitalize text-[11px] sm:inline-flex"
                  >
                    {user.role}
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="hidden h-10 gap-2 rounded-xl border-border/70 bg-background/70 text-muted-foreground shadow-none sm:inline-flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span>Quick Search</span>
              <Kbd>{shortcutLabel}</Kbd>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground sm:hidden"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground">
                  {theme === "dark" ? (
                    <Moon className="h-5 w-5" />
                  ) : theme === "light" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Monitor className="h-5 w-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2" onClick={() => setTheme("light")}>
                  <Sun className="h-4 w-4" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => setTheme("dark")}>
                  <Moon className="h-4 w-4" />
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => setTheme("auto")}>
                  <Monitor className="h-4 w-4" />
                  Auto
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="relative rounded-xl text-muted-foreground"
              onClick={openNotifications}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-0 px-1 text-[10px] shadow-[0_0_0_4px_hsl(var(--background))]"
                >
                  {unreadCount}
                </Badge>
              ) : null}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-xs text-primary-foreground">
                      {user?.username?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-xs text-primary-foreground">
                      {user?.username?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{user?.username}</div>
                    <div className="text-xs capitalize text-muted-foreground">{user?.role}</div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onClick={() => setLocation("/profile")}>
                  <UserRound className="h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => logout()}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[300px] border-border/70 bg-sidebar/92 p-0 backdrop-blur-xl">
          <SheetHeader className="border-b border-border/70 px-4 py-4">
            <SheetTitle className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.82))] text-primary-foreground shadow-[0_18px_50px_hsl(var(--primary)/0.28)]">
                B
              </div>
              <div>
                <div className="text-base font-semibold tracking-[-0.03em]">BIND9Admin</div>
                <div className="text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  DNS Operations
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-88px)]">
            <div className="space-y-6 p-4">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/75">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <NavButton
                        key={item.href}
                        item={item}
                        active={isActiveRoute(location, item.href)}
                        onNavigate={() => setSidebarOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Suspense fallback={<OverlayFallback />}>
        <LayoutCommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          navSections={navSections}
          onNavigate={setLocation}
        />
      </Suspense>

      <Suspense fallback={<OverlayFallback />}>
        <LayoutNotificationsSheet
          open={notifOpen}
          onOpenChange={setNotifOpen}
          notifications={notifications}
        />
      </Suspense>
    </div>
  );
}

