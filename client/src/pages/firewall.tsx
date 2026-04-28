import { useEffect, useState } from "react";
import { Activity, Network, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { FirewallRuleDialog } from "@/components/firewall/FirewallRuleDialog";
import { FirewallRulesPanel } from "@/components/firewall/FirewallRulesPanel";
import { FirewallStatusBanner } from "@/components/firewall/FirewallStatusBanner";
import { DEFAULT_FIREWALL_RULE_FORM, type FirewallRuleFormState } from "@/components/firewall/constants";
import {
  addFirewallRule,
  deleteFirewallRule,
  getFirewallStatus,
  switchFirewallBackend,
  toggleFirewall,
  type AddFirewallRuleData,
  type FirewallBackend,
  type FirewallStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function createDefaultForm(): FirewallRuleFormState {
  return { ...DEFAULT_FIREWALL_RULE_FORM };
}

export default function FirewallPage() {
  const [status, setStatus] = useState<FirewallStatus>({
    active: false,
    rules: [],
    installed: true,
    backend: "none",
    availableBackends: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [form, setForm] = useState<FirewallRuleFormState>(createDefaultForm);

  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const resetForm = () => setForm(createDefaultForm());

  const fetchData = async () => {
    try {
      const data = await getFirewallStatus();
      setStatus(data);
      setError(null);
    } catch (caught: any) {
      setError(caught.message);
      toast({ title: "Error", description: caught.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await toggleFirewall(enabled);
      setStatus((current) => ({ ...current, active: enabled }));
      toast({
        title: enabled ? "Firewall Enabled" : "Firewall Disabled",
        description: enabled ? "System is now protected." : "System is exposed.",
      });
      await fetchData();
    } catch (caught: any) {
      toast({ title: "Error", description: caught.message, variant: "destructive" });
      await fetchData();
    } finally {
      setToggling(false);
    }
  };

  const handleSwitchBackend = async (backend: FirewallBackend) => {
    try {
      const response = await switchFirewallBackend(backend);
      setStatus(response.status);
      toast({ title: `Switched to ${backend === "nftables" ? "nft" : backend.toUpperCase()}` });
    } catch (caught: any) {
      toast({ title: "Error", description: caught.message, variant: "destructive" });
    }
  };

  const handleAddRule = async () => {
    if (form.ruleType === "port" && !form.toPort) {
      toast({ title: "Error", description: "Port number is required", variant: "destructive" });
      return;
    }
    if (form.ruleType === "service" && !form.service) {
      toast({ title: "Error", description: "Service is required", variant: "destructive" });
      return;
    }
    if (form.ruleType === "portRange" && (!form.toPort || !form.toPortEnd)) {
      toast({
        title: "Error",
        description: "Start and end port are required",
        variant: "destructive",
      });
      return;
    }
    if (form.ruleType === "multiPort" && !form.toPort) {
      toast({
        title: "Error",
        description: "Comma-separated ports are required",
        variant: "destructive",
      });
      return;
    }
    if (form.ruleType === "raw" && !form.rawRule) {
      toast({
        title: "Error",
        description: "Raw rule command is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const data: AddFirewallRuleData = {
        toPort: form.toPort,
        proto: form.proto,
        action: form.action,
        fromIp: form.fromIp,
        direction: form.direction,
        ruleType: form.ruleType,
        toPortEnd: form.ruleType === "portRange" ? form.toPortEnd : undefined,
        service: form.ruleType === "service" ? form.service : undefined,
        interface: form.iface || undefined,
        rateLimit: form.rateLimit && form.rateLimit !== "_none" ? form.rateLimit : undefined,
        icmpType: form.ruleType === "icmp" ? form.icmpType : undefined,
        log: form.logEnabled || undefined,
        comment: form.comment || undefined,
        rawRule: form.ruleType === "raw" ? form.rawRule : undefined,
      };
      await addFirewallRule(data);
      toast({ title: "Rule added" });
      setShowModal(false);
      resetForm();
      await fetchData();
    } catch (caught: any) {
      toast({ title: "Error", description: caught.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteFirewallRule(id);
      toast({ title: "Rule deleted" });
      setDeleteTarget(null);
      await fetchData();
    } catch (caught: any) {
      toast({ title: "Error", description: caught.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading firewall"
          description="Fetching backend state, active rules and protection status."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <PageState
          title="Access denied"
          description="Only administrators can manage the firewall."
          icon={ShieldAlert}
          tone="danger"
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error && status.rules.length === 0 && status.backend === "none") {
    return (
      <DashboardLayout>
        <PageState
          title="Firewall status unavailable"
          description={error}
          tone="danger"
          action={<Button onClick={fetchData}>Retry</Button>}
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Firewall"
          description="Manage network protection, backend selection and packet filtering rules."
          icon={Shield}
          badge={
            status.backend !== "none" ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {status.backend.toUpperCase()}
              </Badge>
            ) : undefined
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Protection"
            value={status.active ? "Active" : "Inactive"}
            description={status.installed ? "Current firewall state." : "No supported backend detected."}
            icon={status.active ? ShieldCheck : ShieldAlert}
            tone={status.active ? "success" : "warning"}
          />
          <MetricCard
            label="Backend"
            value={status.backend === "none" ? "Unavailable" : status.backend.toUpperCase()}
            description={`${status.availableBackends.length} backend option(s) detected.`}
            icon={Network}
          />
          <MetricCard
            label="Loaded Rules"
            value={status.rules.length}
            description="Rules currently visible from the selected backend."
            icon={Activity}
          />
          <MetricCard
            label="Available Backends"
            value={status.availableBackends.length}
            description="Supported engines detected on this host."
            icon={Network}
          />
        </div>

        <FirewallStatusBanner
          status={status}
          toggling={toggling}
          onToggle={handleToggle}
          onSwitchBackend={handleSwitchBackend}
        />

        <FirewallRulesPanel
          status={status}
          onCreateRule={() => {
            resetForm();
            setShowModal(true);
          }}
          onDeleteRule={setDeleteTarget}
        />
      </div>

      <FirewallRuleDialog
        open={showModal}
        onOpenChange={setShowModal}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={handleAddRule}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Firewall Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget !== null) {
                  handleDeleteRule(deleteTarget);
                }
              }}
            >
              Delete Rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
