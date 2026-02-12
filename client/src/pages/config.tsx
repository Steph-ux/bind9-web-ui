import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, AlertTriangle, ShieldCheck, Network, Loader2, CheckCircle2, FileJson, ServerCog } from "lucide-react";
import { getConfig, saveConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";

export default function Config() {
  const [optionsContent, setOptionsContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state for structured editing
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
    // Parse listen-on
    const listenMatch = content.match(/listen-on\s*{\s*([^}]+)}/);
    if (listenMatch) setListenV4(listenMatch[1].trim());
    const listenV6Match = content.match(/listen-on-v6\s*{\s*([^}]+)}/);
    if (listenV6Match) setListenV6(listenV6Match[1].trim());
    // Parse forwarders
    const fwdMatch = content.match(/forwarders\s*{\s*([^}]+)}/);
    if (fwdMatch) setForwarders(fwdMatch[1].trim().replace(/;\s*/g, ";\n").trim());
    // Parse allow directives
    const aqMatch = content.match(/allow-query\s*{\s*([^}]+)}/);
    if (aqMatch) setAllowQuery(aqMatch[1].trim());
    const atMatch = content.match(/allow-transfer\s*{\s*([^}]+)}/);
    if (atMatch) setAllowTransfer(atMatch[1].trim());
    const arMatch = content.match(/allow-recursion\s*{\s*([^}]+)}/);
    if (arMatch) setAllowRecursion(arMatch[1].trim());
    // DNSSEC
    if (content.includes("dnssec-validation")) {
      setDnssecEnabled(!content.includes("dnssec-validation no"));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveConfig("options", optionsContent);
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
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ServerCog className="w-8 h-8 text-primary" />
              Server Configuration
            </h1>
            <p className="text-muted-foreground mt-1 text-lg">Manage global BIND9 options and behavior.</p>
          </div>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saving} className={`shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all ${saved ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saved ? "Configuration Saved" : "Save Changes"}
            </Button>
          )}
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="bg-muted/50 border border-white/5 p-1 mb-6 h-auto">
            <TabsTrigger value="general" className="px-6 py-2 gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 border border-transparent transition-all">
              <Network className="w-4 h-4" /> General
            </TabsTrigger>
            <TabsTrigger value="security" className="px-6 py-2 gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 border border-transparent transition-all">
              <ShieldCheck className="w-4 h-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="advanced" className="px-6 py-2 gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 border border-transparent transition-all">
              <FileJson className="w-4 h-4" /> Raw Config
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-blue-400" />
                    Listening Interfaces
                  </CardTitle>
                  <CardDescription>Configure the network interfaces BIND9 should listen on.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">IPv4 Interfaces</Label>
                    <Input value={listenV4} onChange={e => setListenV4(e.target.value)} className="font-mono bg-black/40 border-white/10 focus:border-primary/50 text-sm" placeholder="any;" />
                    <p className="text-[10px] text-muted-foreground">Example: <code>192.168.1.5; 127.0.0.1;</code> or <code>any;</code></p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">IPv6 Interfaces</Label>
                    <Input value={listenV6} onChange={e => setListenV6(e.target.value)} className="font-mono bg-black/40 border-white/10 focus:border-primary/50 text-sm" placeholder="any;" />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ServerCog className="w-5 h-5 text-green-400" />
                    Forwarding
                  </CardTitle>
                  <CardDescription>Upstream DNS servers for recursive lookups.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Forwarder IPs</Label>
                    <Textarea
                      className="font-mono bg-black/40 border-white/10 focus:border-primary/50 min-h-[100px] text-sm leading-relaxed"
                      value={forwarders}
                      onChange={e => setForwarders(e.target.value)}
                      placeholder="8.8.8.8;"
                    />
                    <p className="text-[10px] text-muted-foreground">Enter one IP per line (or semicolon separated).</p>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-white/5 mt-2">
                    <div className="space-y-0.5">
                      <Label>Forward Only</Label>
                      <p className="text-xs text-muted-foreground">Disable recursion if forwarders fail</p>
                    </div>
                    <Switch checked={forwardOnly} onCheckedChange={setForwardOnly} />
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={buildConfigFromForm} className="opacity-80 hover:opacity-100">
                Generate & Preview Config
              </Button>
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-red-400" />
                    Access Control Lists (ACLs)
                  </CardTitle>
                  <CardDescription>Restrict who can query or transfer zones.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Allow Query</Label>
                    <Input value={allowQuery} onChange={e => setAllowQuery(e.target.value)} className="font-mono bg-black/40 border-white/10 focus:border-primary/50 text-sm" placeholder="any;" />
                    <p className="text-[10px] text-muted-foreground">Who can ask this server to resolve names.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Allow Recursion</Label>
                    <Input value={allowRecursion} onChange={e => setAllowRecursion(e.target.value)} className="font-mono bg-black/40 border-white/10 focus:border-primary/50 text-sm" placeholder="trusted;" />
                    <p className="text-[10px] text-muted-foreground">Who can use this server to find names it doesn't own.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold">Allow Transfer</Label>
                    <Input value={allowTransfer} onChange={e => setAllowTransfer(e.target.value)} className="font-mono bg-black/40 border-white/10 focus:border-primary/50 text-sm" placeholder="none;" />
                    <p className="text-[10px] text-muted-foreground">Secondary servers allowed to copy zone data.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    DNSSEC Validation
                  </CardTitle>
                  <CardDescription>Enhance security by validating DNS signatures.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-black/20 border border-white/10">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Enable Validation</Label>
                      <p className="text-xs text-muted-foreground">Prevents connection to spoofed/poisoned domains</p>
                    </div>
                    <Switch checked={dnssecEnabled} onCheckedChange={setDnssecEnabled} />
                  </div>
                  {!dnssecEnabled && (
                    <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
                      <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold text-red-400">Security Warning</h4>
                        <p className="text-xs text-red-200/70 mt-1">Disabling DNSSEC removes protection against cache poisoning attacks. This is generally not recommended for production servers.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={buildConfigFromForm} className="opacity-80 hover:opacity-100">
                Generate & Preview Config
              </Button>
            </div>
          </TabsContent>

          {/* Advanced (Raw) Tab */}
          <TabsContent value="advanced">
            <Card className="glass-panel border-primary/20 bg-black/40">
              <CardHeader className="border-b border-primary/10 pb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">Raw Configuration</CardTitle>
                    <CardDescription>Directly edit <code>named.conf.options</code>.</CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/30">options block</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative group">
                  <Textarea
                    className="min-h-[500px] w-full bg-[#0d1117] text-[#c9d1d9] font-mono text-sm border-0 focus-visible:ring-0 p-6 leading-relaxed resize-y"
                    value={optionsContent}
                    onChange={e => setOptionsContent(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="absolute top-4 right-4 opacity-50 text-[10px] text-muted-foreground pointer-events-none">
                    vim syntax: bind
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}