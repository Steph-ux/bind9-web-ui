import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-provider";
import { getLogs, type LogData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Globe,
  Settings,
  Shield,
  Server,
  Terminal,
  Plug,
  Users,
  UserRound,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  ShieldBan,
  Bell,
  Search,
  Menu,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeft,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebarExpanded") === "false"
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    if (theme === "auto") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(isDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sidebarExpanded", sidebarCollapsed ? "false" : "true");
  }, [sidebarCollapsed]);

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Notifications
  const [notifications, setNotifications] = useState<LogData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getLogs({ limit: 5 }).then((logs) => {
      setNotifications(logs);
      // Compare with last seen log ID stored in localStorage
      const lastSeenId = localStorage.getItem("lastSeenLogId");
      const newCount = lastSeenId ? logs.findIndex((l) => l.id === lastSeenId) : logs.length;
      setUnreadCount(newCount === -1 ? logs.length : newCount);
    }).catch(console.error);
  }, []);

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, href: "/" },
    { label: "Zones", icon: Globe, href: "/zones" },
    { label: "Configuration", icon: Settings, href: "/config" },
    { label: "ACLs & Keys", icon: Shield, href: "/acls" },
    { label: "Logs", icon: Terminal, href: "/logs" },
    { label: "Server Status", icon: Server, href: "/status" },
    { label: "Connections", icon: Plug, href: "/connections" },
  ];

  if (user?.role === "admin") {
    navItems.push({ label: "Firewall", icon: ShieldCheck, href: "/firewall" });
    navItems.push({ label: "DNS Firewall", icon: ShieldAlert, href: "/firewall-rpz" });
    navItems.push({ label: "IP Blacklist", icon: ShieldBan, href: "/blacklist" });
    navItems.push({ label: "Users", icon: Users, href: "/users" });
  }

  const runCommand = useCallback((command: () => void) => {
    setCommandOpen(false);
    command();
  }, []);

  const levelIcon = (level: string) => {
    switch (level) {
      case "ERROR": return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "WARN": return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
      case "INFO": return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
      default: return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden lg:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-60"}`}>
        {/* Brand */}
        <div className="flex items-center h-14 px-4 border-b">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">B</div>
            {!sidebarCollapsed && <span className="font-semibold text-base">BIND9Admin</span>}
          </Link>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 py-2">
          <div className="px-3 py-2">
            {!sidebarCollapsed && (
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Control Panel</p>
            )}
            <Separator className="my-2" />
          </div>
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    } ${sidebarCollapsed ? "justify-center" : ""}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
        <div className="border-t px-3 py-3 text-center">
          {!sidebarCollapsed ? (
            <p className="text-[10px] text-muted-foreground leading-tight">
              Copyright &copy; 2025 Stephane ASSOGBA
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">&copy;</p>
          )}
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          {/* Mobile menu toggle */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          {/* Desktop sidebar toggle */}
          <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>

          <div className="flex-1" />

          {/* Search */}
          <Button variant="outline" size="sm" className="hidden sm:flex gap-2 text-muted-foreground" onClick={() => setCommandOpen(true)}>
            <Search className="h-4 w-4" />
            <span className="text-xs">⌘K</span>
          </Button>
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setCommandOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>

          {/* Theme toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                {theme === "dark" ? <Moon className="h-5 w-5" /> : theme === "light" ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => setTheme("light")}>
                <Sun className="h-4 w-4" /> Light
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => setTheme("dark")}>
                <Moon className="h-4 w-4" /> Dark
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => setTheme("auto")}>
                <Monitor className="h-4 w-4" /> Auto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative" onClick={() => { setNotifOpen(true); setUnreadCount(0); if (notifications.length > 0) localStorage.setItem("lastSeenLogId", notifications[0].id); }}>
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center" variant="destructive">
                {unreadCount}
              </Badge>
            )}
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {user?.username?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.username?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{user?.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onClick={() => setLocation("/profile")}>
                <UserRound className="h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => logout()}>
                <LogOut className="h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* ── Mobile Sidebar (Sheet) ── */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">B</div>
              BIND9Admin
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <nav className="flex flex-col gap-1 p-2">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
                    <button
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Command Search (⌘K) ── */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search zones, records, configs..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {navItems.map((item) => (
              <CommandItem key={item.href} onSelect={() => runCommand(() => setLocation(item.href))}>
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* ── Notifications Sheet ── */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="right" className="w-80 !w-80 sm:!max-w-80 p-0 flex flex-col">
          <SheetHeader className="border-b px-4 py-3 flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Notifications
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors">
                    {levelIcon(log.level)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{log.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.source} &middot; {new Date(log.timestamp).toLocaleTimeString()}
                      </p>
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