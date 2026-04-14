import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Save, AlertTriangle, ShieldCheck, Network, Loader2, CheckCircle2, FileJson, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getConfig, saveConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";

export default function Config() {
  const [optionsContent, setOptionsContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const [listenV4, setListenV4] = useState("any;");
  const [listenV6, setListenV6] = useState("any;");
  const [forwarders, setForwarders] = useState("8.8.8.8;\n8.8.4.4;");
  const [forwardOnly, setForwardOnly] = useState(false);
  const [allowQuery, setAllowQuery] = useState("localhost; 192.168.0.0/16;");
  const [allowTransfer, setAllowTransfer] = useState("none;");
  const [allowRecursion, setAllowRecursion] = useState("trusted-clients;");
  const [dnssecEnabled, setDnssecEnabled] = useState(true);

  const { toast } = useToast();
  const { isAdmin } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const data = await getConfig("options");
        setOptionsContent(data.content);
        parseConfigForForm(data.content);
      } catch (e: any) {
        toast({ title: "Info", description: "Using default configuration" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const parseConfigForForm = (content: string) => {
    const listenMatch = content.match(/listen-on\s*{\s*([^}]+)}/);
    if (listenMatch) setListenV4(listenMatch[1].trim());
    const listenV6Match = content.match(/listen-on-v6\s*{\s*([^}]+)}/);
    if (listenV6Match) setListenV6(listenV6Match[1].trim());
    const fwdMatch = content.match(/forwarders\s*{\s*([^}]+)}/);
    if (fwdMatch) setForwarders(fwdMatch[1].trim().replace(/;\s*/g, ";\n").trim());
    const aqMatch = content.match(/allow-query\s*{\s*([^}]+)}/);
    if (aqMatch) setAllowQuery(aqMatch[1].trim());
    const atMatch = content.match(/allow-transfer\s*{\s*([^}]+)}/);
    if (atMatch) setAllowTransfer(atMatch[1].trim());
    const arMatch = content.match(/allow-recursion\s*{\s*([^}]+)}/);
    if (arMatch) setAllowRecursion(arMatch[1].trim());
    if (content.includes("dnssec-validation")) {
      setDnssecEnabled(!content.includes("dnssec-validation no"));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Always rebuild config from form fields before saving
      const content = buildConfigFromForm();
      await saveConfig("options", content);
      setSaved(true);
      toast({ title: "Saved", description: "Configuration saved successfully" });
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const buildConfigFromForm = () => {
    const content = `options {
    directory "/var/cache/bind";

    // Network
    listen-on { ${listenV4} };
    listen-on-v6 { ${listenV6} };

    // Forwarding
    forwarders {
        ${forwarders.split("\n").map(l => l.trim()).filter(Boolean).join("\n        ")}
    };
    ${forwardOnly ? 'forward only;' : '// forward only; (disabled)'}

    // Security
    dnssec-validation ${dnssecEnabled ? 'auto' : 'no'};
    auth-nxdomain no;

    // Access Control
    allow-query { ${allowQuery} };
    allow-transfer { ${allowTransfer} };
    allow-recursion { ${allowRecursion} };

    // Logging
    querylog yes;
};`;
    setOptionsContent(content);
    return content;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <ServerCog className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Server Configuration</h2>
            <p className="text-muted-foreground">Manage global BIND9 options and behavior.</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={handleSave} disabled={saving} variant={saved ? "outline" : "default"} className={saved ? "border-green-500 text-green-600" : ""}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saved ? "Configuration Saved" : "Save Changes"}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general" className="gap-2"><Network className="h-4 w-4" /> General</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><ShieldCheck className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2"><FileJson className="h-4 w-4" /> Raw Config</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Network className="h-5 w-5 text-primary" /> Listening Interfaces
                </CardTitle>
                <p className="text-sm text-muted-foreground">Configure the network interfaces BIND9 should listen on.</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">IPv4 Interfaces</Label>
                  <Input className="font-mono" value={listenV4} onChange={e => setListenV4(e.target.value)} placeholder="any;" />
                  <p className="text-xs text-muted-foreground">Example: <code className="rounded bg-muted px-1">192.168.1.5; 127.0.0.1;</code> or <code className="rounded bg-muted px-1">any;</code></p>
                </div>
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">IPv6 Interfaces</Label>
                  <Input className="font-mono" value={listenV6} onChange={e => setListenV6(e.target.value)} placeholder="any;" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ServerCog className="h-5 w-5 text-green-600" /> Forwarding
                </CardTitle>
                <p className="text-sm text-muted-foreground">Upstream DNS servers for recursive lookups.</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">Forwarder IPs</Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={forwarders}
                    onChange={e => setForwarders(e.target.value)}
                    placeholder="8.8.8.8;"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Enter one IP per line (or semicolon separated).</p>
                </div>

                <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                  <div>
                    <Label htmlFor="forwardOnlySwitch" className="font-medium cursor-pointer">Forward Only</Label>
                    <p className="text-xs text-muted-foreground">Disable recursion if forwarders fail</p>
                  </div>
                  <Switch id="forwardOnlySwitch" checked={forwardOnly} onCheckedChange={setForwardOnly} />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="text-end">
            <Button variant="outline" size="sm" onClick={buildConfigFromForm}>Generate & Preview Config</Button>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-red-600" /> Access Control Lists (ACLs)
                </CardTitle>
                <p className="text-sm text-muted-foreground">Restrict who can query or transfer zones.</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">Allow Query</Label>
                  <Input className="font-mono" value={allowQuery} onChange={e => setAllowQuery(e.target.value)} placeholder="any;" />
                  <p className="text-xs text-muted-foreground">Who can ask this server to resolve names.</p>
                </div>
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">Allow Recursion</Label>
                  <Input className="font-mono" value={allowRecursion} onChange={e => setAllowRecursion(e.target.value)} placeholder="trusted;" />
                  <p className="text-xs text-muted-foreground">Who can use this server to find names it doesn't own.</p>
                </div>
                <div className="space-y-2">
                  <Label className="uppercase font-semibold text-muted-foreground text-xs">Allow Transfer</Label>
                  <Input className="font-mono" value={allowTransfer} onChange={e => setAllowTransfer(e.target.value)} placeholder="none;" />
                  <p className="text-xs text-muted-foreground">Secondary servers allowed to copy zone data.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-blue-600" /> DNSSEC Validation
                </CardTitle>
                <p className="text-sm text-muted-foreground">Enhance security by validating DNS signatures.</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                  <div>
                    <Label htmlFor="dnssecSwitch" className="font-medium cursor-pointer">Enable Validation</Label>
                    <p className="text-xs text-muted-foreground">Prevents connection to spoofed/poisoned domains</p>
                  </div>
                  <Switch id="dnssecSwitch" checked={dnssecEnabled} onCheckedChange={setDnssecEnabled} />
                </div>

                {!dnssecEnabled && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Security Warning</AlertTitle>
                    <AlertDescription>Disabling DNSSEC removes protection against cache poisoning attacks. This is generally not recommended for production servers.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="text-end">
            <Button variant="outline" size="sm" onClick={buildConfigFromForm}>Generate & Preview Config</Button>
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <Card className="bg-zinc-950 dark:bg-zinc-950 text-zinc-100 dark:text-zinc-100 overflow-hidden">
            <CardHeader className="border-b border-zinc-800 dark:border-zinc-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-zinc-100 dark:text-zinc-100">Raw Configuration</CardTitle>
                <p className="text-sm text-zinc-500 dark:text-zinc-500">Directly edit <code className="rounded bg-zinc-800 dark:bg-zinc-800 px-1">named.conf.options</code>.</p>
              </div>
              <Badge variant="secondary" className="font-mono">options block</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <textarea
                className="w-full bg-zinc-950 dark:bg-zinc-950 text-zinc-100 dark:text-zinc-100 border-0 p-4 font-mono text-sm focus:outline-none focus:ring-0 shadow-none rounded-none"
                value={optionsContent}
                onChange={e => setOptionsContent(e.target.value)}
                spellCheck={false}
                rows={20}
                style={{ resize: "vertical" }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}