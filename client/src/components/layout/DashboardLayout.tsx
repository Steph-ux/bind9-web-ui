import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  Globe,
  Info,
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
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Separator } from "@/components/ui/separator";
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
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
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

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
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
    getLogs({ limit: 5 })
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

  const levelIcon = (level: string) => {
    switch (level) {
      case "ERROR":
        return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
      case "WARN":
        return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
      case "INFO":
        return <Info className="h-4 w-4 shrink-0 text-blue-500" />;
      default:
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.06),transparent_28%),radial-gradient(circle_at_top_right,hsl(var(--accent)/0.08),transparent_24%)] bg-background text-foreground">
      <aside
        className={[
          "hidden border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur lg:flex lg:flex-col",
          sidebarCollapsed ? "w-[92px]" : "w-[280px]",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/80 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-base font-semibold">B</span>
            </div>
            {!sidebarCollapsed ? (
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-sidebar-foreground">
                  BIND9Admin
                </div>
                <div className="text-xs text-sidebar-foreground/60">
                  DNS control workspace
                </div>
              </div>
            ) : null}
          </Link>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-3 py-4">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-2">
                {!sidebarCollapsed ? (
                  <div className="px-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
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

        <div className="border-t border-sidebar-border/80 px-4 py-4">
          {!sidebarCollapsed ? (
            <div className="rounded-2xl border border-sidebar-border/70 bg-background/70 px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {user?.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user?.username}</div>
                  <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user?.username?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Control Panel
              </div>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{currentRouteLabel}</h2>
                {user?.role ? (
                  <Badge variant="outline" className="hidden capitalize sm:inline-flex">
                    {user.role}
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 text-muted-foreground sm:inline-flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span>Quick Search</span>
              <Kbd>{shortcutLabel}</Kbd>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
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

            <Button variant="ghost" size="icon" className="relative" onClick={openNotifications}>
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]"
                >
                  {unreadCount}
                </Badge>
              ) : null}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user?.username?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
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

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                B
              </div>
              <div>
                <div className="text-base font-semibold">BIND9Admin</div>
                <div className="text-xs font-normal text-muted-foreground">
                  DNS control workspace
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-88px)]">
            <div className="space-y-6 p-4">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No result found.</CommandEmpty>
          {navSections.map((section) => (
            <CommandGroup key={section.title} heading={section.title}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => {
                    setCommandOpen(false);
                    setLocation(item.href);
                  }}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="right" className="flex w-96 max-w-full flex-col p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
                <Bell className="h-10 w-10 opacity-40" />
                <div>
                  <p className="font-medium text-foreground">No notifications yet</p>
                  <p className="text-sm text-muted-foreground">
                    Recent log activity will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-4">
                    {levelIcon(log.level)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{log.message}</p>
                        <Badge variant="outline" className="shrink-0">
                          {log.level}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{log.source}</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

