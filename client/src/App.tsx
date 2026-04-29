// Copyright (c) 2025 Stephane ASSOGBA

import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth-provider";
import { queryClient } from "@/lib/queryClient";

const ACLs = lazy(() => import("@/pages/acls"));
const ApiTokensPage = lazy(() => import("@/pages/api-tokens"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const BlacklistPage = lazy(() => import("@/pages/blacklist"));
const ChangePasswordPage = lazy(() => import("@/pages/change-password-page"));
const Config = lazy(() => import("@/pages/config"));
const Connections = lazy(() => import("@/pages/connections"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const FirewallPage = lazy(() => import("@/pages/firewall"));
const FirewallDNS = lazy(() => import("@/pages/firewall-dns"));
const Logs = lazy(() => import("@/pages/logs"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const ReplicationPage = lazy(() => import("@/pages/replication-page"));
const Status = lazy(() => import("@/pages/status"));
const UsersPage = lazy(() => import("@/pages/users-page"));
const ZoneEditor = lazy(() => import("@/pages/zone-editor"));
const Zones = lazy(() => import("@/pages/zones"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_26%),radial-gradient(circle_at_top_right,hsl(var(--accent)/0.1),transparent_20%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]">
      <div className="linear-panel rounded-2xl px-5 py-4 text-sm text-muted-foreground">
        Loading page...
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/zones" component={Zones} />
      <ProtectedRoute path="/zones/:id" component={ZoneEditor} />
      <ProtectedRoute path="/config" component={Config} />
      <ProtectedRoute path="/logs" component={Logs} />
      <ProtectedRoute path="/acls" component={ACLs} />
      <ProtectedRoute path="/status" component={Status} />
      <ProtectedRoute path="/connections" component={Connections} adminOnly />
      <ProtectedRoute path="/users" component={UsersPage} adminOnly />
      <ProtectedRoute path="/firewall" component={FirewallPage} adminOnly />
      <ProtectedRoute path="/firewall-rpz" component={FirewallDNS} adminOnly />
      <ProtectedRoute path="/blacklist" component={BlacklistPage} adminOnly />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/api-tokens" component={ApiTokensPage} adminOnly />
      <ProtectedRoute path="/replication" component={ReplicationPage} adminOnly />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<RouteFallback />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}


