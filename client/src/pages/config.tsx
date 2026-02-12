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
import { Save, AlertTriangle, ShieldCheck, Network, Loader2, CheckCircle2 } from "lucide-react";
import { getConfig, saveConfig } from "@/lib/api";
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Server Configuration</h1>
          <p className="text-muted-foreground mt-1">Global options for named.conf.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-card/50 border border-primary/10">
          <TabsTrigger value="general" className="gap-2"><Network className="w-4 h-4" /> General</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><ShieldCheck className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2"><AlertTriangle className="w-4 h-4" /> Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-6">
            <Card className="glass-panel border-primary/10">
              <CardHeader>
                <CardTitle>Network Interfaces</CardTitle>
                <CardDescription>Configure which IP addresses BIND listens on.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Listen-on (IPv4)</Label>
                  <Input value={listenV4} onChange={e => setListenV4(e.target.value)} className="font-mono bg-background/50 border-primary/20" />
                  <p className="text-xs text-muted-foreground">Use semicolon separated list or 'any;'</p>
                </div>
                <div className="grid gap-2">
                  <Label>Listen-on-v6 (IPv6)</Label>
                  <Input value={listenV6} onChange={e => setListenV6(e.target.value)} className="font-mono bg-background/50 border-primary/20" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/10">
              <CardHeader>
                <CardTitle>Forwarding</CardTitle>
                <CardDescription>Upstream DNS servers for recursive queries.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Forwarders</Label>
                  <Textarea
                    className="font-mono bg-background/50 border-primary/20 h-32"
                    value={forwarders}
                    onChange={e => setForwarders(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">One IP per line, ending with semicolon.</p>
                </div>
                <div className="flex items-center justify-between p-4 border border-border/50 rounded-lg bg-card/30">
                  <div className="space-y-0.5">
                    <Label className="text-base">Forward Only</Label>
                    <p className="text-sm text-muted-foreground">Do not attempt recursion if forwarders fail</p>
                  </div>
                  <Switch checked={forwardOnly} onCheckedChange={setForwardOnly} />
                </div>
                <Button variant="outline" onClick={buildConfigFromForm} className="gap-2">
                  Apply to Raw Config
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-6">
            <Card className="glass-panel border-primary/10">
              <CardHeader>
                <CardTitle>Access Control</CardTitle>
                <CardDescription>Define who can query your server.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Allow-query</Label>
                  <Input value={allowQuery} onChange={e => setAllowQuery(e.target.value)} className="font-mono bg-background/50 border-primary/20" />
                </div>
                <div className="grid gap-2">
                  <Label>Allow-transfer</Label>
                  <Input value={allowTransfer} onChange={e => setAllowTransfer(e.target.value)} className="font-mono bg-background/50 border-primary/20" />
                </div>
                <div className="grid gap-2">
                  <Label>Allow-recursion</Label>
                  <Input value={allowRecursion} onChange={e => setAllowRecursion(e.target.value)} className="font-mono bg-background/50 border-primary/20" />
                </div>
                <Button variant="outline" onClick={buildConfigFromForm} className="gap-2">
                  Apply to Raw Config
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/10">
              <CardHeader>
                <CardTitle>DNSSEC Validation</CardTitle>
                <CardDescription>Configure security extensions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">DNSSEC Validation</Label>
                    <p className="text-sm text-muted-foreground">Validate responses from upstream servers</p>
                  </div>
                  <Switch checked={dnssecEnabled} onCheckedChange={setDnssecEnabled} />
                </div>
                {!dnssecEnabled && (
                  <div className="p-4 rounded-md bg-yellow-900/10 border border-yellow-900/30">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-semibold text-sm">Warning</span>
                    </div>
                    <p className="text-xs text-yellow-200/80">
                      Disabling DNSSEC validation exposes your network to cache poisoning attacks. Only disable for debugging.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <Card className="glass-panel border-primary/10">
            <CardHeader>
              <CardTitle>Raw Configuration Options</CardTitle>
              <CardDescription>Directly edit the options block. Syntax errors may prevent server start.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative font-mono text-sm">
                <div className="absolute top-3 right-3 z-10">
                  <Badge variant="outline" className="bg-background/80 backdrop-blur">named.conf.options</Badge>
                </div>
                <Textarea
                  className="min-h-[400px] bg-black/40 text-green-400 border-primary/20 resize-y p-4 leading-relaxed"
                  value={optionsContent}
                  onChange={e => setOptionsContent(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}