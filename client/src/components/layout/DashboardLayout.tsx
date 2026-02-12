import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-provider";
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
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import networkBg from "../../assets/network-bg.png";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, logout } = useAuth();

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
        <div className="bg-card/50 rounded-lg p-3 border border-border flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
          <div className="flex-1 overflow-hidden">
            <div className="text-xs font-medium text-foreground truncate">{user?.username || "System Online"}</div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">{user?.role || "v9.18.12"}</div>
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
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                <Terminal className="w-4 h-4" />
                <span className="font-mono text-xs opacity-70">root@ns1.infrastructure.local</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-destructive rounded-full border border-background"></span>
              </Button>
              <div className="h-6 w-px bg-border/60 mx-1"></div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-foreground">Admin User</div>
                  <div className="text-xs text-muted-foreground">System Administrator</div>
                </div>
                <Avatar className="h-8 w-8 border border-primary/30 ring-2 ring-primary/10">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback className="bg-primary/20 text-primary">AD</AvatarFallback>
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