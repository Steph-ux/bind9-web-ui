// Copyright © 2025 Stephane ASSOGBA
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth-provider";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import ChangePasswordPage from "@/pages/change-password-page";
import Dashboard from "@/pages/dashboard";
import Zones from "@/pages/zones";
import Config from "@/pages/config";
import Logs from "@/pages/logs";
import ACLs from "@/pages/acls";
import Status from "@/pages/status";
import Connections from "@/pages/connections";
import ZoneEditor from "@/pages/zone-editor";
import UsersPage from "@/pages/users-page";
import FirewallPage from "@/pages/firewall";
import FirewallDNS from "@/pages/firewall-dns";
import BlacklistPage from "@/pages/blacklist";
import ProfilePage from "@/pages/profile";

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
      <ProtectedRoute path="/connections" component={Connections} />
      <ProtectedRoute path="/users" component={UsersPage} adminOnly />
      <ProtectedRoute path="/firewall" component={FirewallPage} adminOnly />
      <ProtectedRoute path="/firewall-rpz" component={FirewallDNS} adminOnly />
      <ProtectedRoute path="/blacklist" component={BlacklistPage} adminOnly />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;