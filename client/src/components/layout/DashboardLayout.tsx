import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-provider";
import { getStatus, getLogs, type LogData } from "@/lib/api";
import {
  LayoutDashboard,
  Globe,
  Settings,
  Activity,
  Shield,
  Server,
  Terminal,
  Menu,
  Bell,
  Plug,
  Users,
  LogOut,
  ShieldCheck,
  User,
  UserCog,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import networkBg from "../../assets/network-bg.png";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  // Dynamic System Info
  const [hostname, setHostname] = useState("loading...");
  const [notifications, setNotifications] = useState<LogData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Fetch Hostname
    getStatus().then(data => setHostname(data.hostname)).catch(() => setHostname("bind9-server"));

    // Fetch Notifications (Recent Logs)
    getLogs({ limit: 5 }).then(logs => {
      setNotifications(logs);
      setUnreadCount(logs.length > 0 ? logs.length : 0);
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
    navItems.push({ label: "Users", icon: Users, href: "/users" });
  }

  // Role-based UI helpers
  const getRoleIcon = () => {
    switch (user?.role) {
      case "admin": return <UserCog className="w-5 h-5 text-red-500" />;
      case "operator": return <User className="w-5 h-5 text-blue-500" />;
      default: return <Eye className="w-5 h-5 text-gray-500" />;
    }
  };

  const getRoleColor = () => {
    switch (user?.role) {
      case "admin": return "text-red-500 bg-red-500/10 border-red-500/20";
      case "operator": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      default: return "text-gray-500 bg-gray-500/10 border-gray-500/20";
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border">
      <div className="p-6 flex items-center gap-3 border-b border-border/40">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center border border-primary/50 shadow-[0_0_10px_rgba(0,240,255,0.3)]">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-bold tracking-tight text-lg">BIND9<span className="text-primary">Admin</span></h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Control Panel</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 group
                ${isActive
                ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(0,240,255,0.1)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              <span className="font-medium">{item.label}</span>
              {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_var(--color-primary)] animate-pulse" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/40 space-y-4">
        <div className={`rounded-lg p-3 border flex items-center gap-3 ${getRoleColor()}`}>
          <div className="bg-background/50 p-1.5 rounded-full">
            {getRoleIcon()}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-xs font-bold uppercase tracking-wider truncate">{user?.role || "Guest"}</div>
            <div className="text-[10px] opacity-70 truncate">v9.18.28</div>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={() => logout()}>
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 relative overflow-hidden">
      {/* Background Effect */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20">
        <img src={networkBg} alt="" className="w-full h-full object-cover mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 flex-shrink-0 z-20">
          <SidebarContent />
        </aside>

        {/* Mobile Sidebar */}
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetContent side="left" className="p-0 w-64 border-r border-border bg-sidebar">
            <SidebarContent />
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header */}
          <header className="h-16 border-b border-border/40 bg-background/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-20">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground" onClick={() => setIsMobileOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-black/20 px-3 py-1.5 rounded-md border border-white/5">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="font-mono text-xs opacity-90 text-primary">
                  {user?.username || "user"}@{hostname}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-destructive rounded-full border border-background shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 glass-panel border-primary/20" align="end">
                  <div className="p-3 border-b border-border/40 flex justify-between items-center bg-muted/20">
                    <h3 className="font-semibold text-sm">System Events</h3>
                    {unreadCount > 0 && <Badge variant="outline" className="text-xs">{unreadCount} new</Badge>}
                  </div>
                  <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        No recent notifications
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {notifications.map((notif) => (
                          <div key={notif.id} className="p-3 border-b border-border/10 hover:bg-muted/30 transition-colors text-sm">
                            <div className="flex items-start gap-3">
                              {notif.level === "ERROR" ? <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" /> :
                                notif.level === "WARN" ? <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" /> :
                                  <Info className="w-4 h-4 text-blue-500 mt-0.5" />}
                              <div>
                                <p className="font-medium text-foreground">{notif.message}</p>
                                <p className="text-xs text-muted-foreground mt-1 flex justify-between">
                                  <span>{notif.source}</span>
                                  <span>{new Date(notif.timestamp).toLocaleTimeString()}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <div className="h-6 w-px bg-border/60 mx-1"></div>

              {/* User Avatar */}
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-foreground">{user?.username || "Guest"}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {user?.role === "admin" ? "System Administrator" :
                      user?.role === "operator" ? "DNS Operator" : "Viewer"}
                  </div>
                </div>
                <Avatar className={`h-8 w-8 border ring-2 ring-offset-2 ring-offset-background transition-all hover:scale-105 ${user?.role === "admin" ? "border-red-500/30 ring-red-500/10" :
                    user?.role === "operator" ? "border-blue-500/30 ring-blue-500/10" :
                      "border-gray-500/30 ring-gray-500/10"
                  }`}>
                  <AvatarImage src={`https://ui-avatars.com/api/?name=${user?.username}&background=${user?.role === 'admin' ? 'ef4444' : user?.role === 'operator' ? '3b82f6' : '6b7280'}&color=fff`} />
                  <AvatarFallback className="bg-muted">
                    {user?.username?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
            <div className="container mx-auto p-6 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}