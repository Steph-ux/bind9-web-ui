import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Zones from "@/pages/zones";
import Config from "@/pages/config";
import Logs from "@/pages/logs";
import ACLs from "@/pages/acls";
import Status from "@/pages/status";
import Connections from "@/pages/connections";
import ZoneEditor from "@/pages/zone-editor";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/zones" component={Zones} />
      <Route path="/zones/:id" component={ZoneEditor} />
      <Route path="/config" component={Config} />
      <Route path="/logs" component={Logs} />
      <Route path="/acls" component={ACLs} />
      <Route path="/status" component={Status} />
      <Route path="/connections" component={Connections} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;