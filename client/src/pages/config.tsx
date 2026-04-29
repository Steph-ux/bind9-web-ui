import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Loader2,
  Network,
  Save,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import { getConfig, saveConfig } from "@/lib/api";

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
    setForwardOnly(/\bforward\s+only\s*;/m.test(content));
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

  useEffect(() => {
    if (activeTab !== "advanced" && optionsContent) {
      parseConfigForForm(optionsContent);
    }
  }, [activeTab, optionsContent]);

  const buildOptionsTemplate = () => `options {
    directory "/var/cache/bind";

    // Network
    listen-on { ${listenV4} };
    listen-on-v6 { ${listenV6} };

    // Forwarding
    forwarders {
        ${forwarders
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n        ")}
    };
    forward ${forwardOnly ? "only" : "first"};

    // Security
    dnssec-validation ${dnssecEnabled ? "auto" : "no"};
    auth-nxdomain no;

    // Access Control
    allow-query { ${allowQuery} };
    allow-transfer { ${allowTransfer} };
    allow-recursion { ${allowRecursion} };

    // Logging
    querylog yes;
};`;

  const insertBeforeOptionsClose = (content: string, directiveBlock: string) => {
    const closeIndex = content.lastIndexOf("};");
    if (closeIndex === -1) {
      return buildOptionsTemplate();
    }

    const beforeClose = content.slice(0, closeIndex).replace(/\s*$/, "");
    const afterClose = content.slice(closeIndex);
    return `${beforeClose}\n${directiveBlock}\n${afterClose}`;
  };

  const upsertBraceDirective = (content: string, directive: string, body: string) => {
    const block = `    ${directive} { ${body} };`;
    const pattern = new RegExp(`^\\s*${directive}\\s*\\{[^}]*\\};`, "m");
    return pattern.test(content)
      ? content.replace(pattern, block)
      : insertBeforeOptionsClose(content, block);
  };

  const upsertMultilineBlock = (content: string, directive: string, blockBody: string) => {
    const block = `    ${directive} {\n${blockBody}\n    };`;
    const pattern = new RegExp(`^\\s*${directive}\\s*\\{[\\s\\S]*?^\\s*\\};`, "m");
    return pattern.test(content)
      ? content.replace(pattern, block)
      : insertBeforeOptionsClose(content, block);
  };

  const upsertSimpleDirective = (content: string, directive: string, value: string) => {
    const line = `    ${directive} ${value};`;
    const pattern = new RegExp(`^\\s*${directive}\\s+[^;]+;`, "m");
    return pattern.test(content)
      ? content.replace(pattern, line)
      : insertBeforeOptionsClose(content, line);
  };

  const mergeFormIntoOptionsContent = (baseContent: string) => {
    let nextContent = baseContent.trim() ? baseContent : buildOptionsTemplate();
    const formattedForwarders = forwarders
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `        ${line}`)
      .join("\n");

    nextContent = upsertBraceDirective(nextContent, "listen-on", listenV4);
    nextContent = upsertBraceDirective(nextContent, "listen-on-v6", listenV6);
    nextContent = upsertMultilineBlock(
      nextContent,
      "forwarders",
      formattedForwarders || "        8.8.8.8;",
    );
    nextContent = upsertSimpleDirective(nextContent, "forward", forwardOnly ? "only" : "first");
    nextContent = upsertSimpleDirective(
      nextContent,
      "dnssec-validation",
      dnssecEnabled ? "auto" : "no",
    );
    nextContent = upsertSimpleDirective(nextContent, "auth-nxdomain", "no");
    nextContent = upsertBraceDirective(nextContent, "allow-query", allowQuery);
    nextContent = upsertBraceDirective(nextContent, "allow-transfer", allowTransfer);
    nextContent = upsertBraceDirective(nextContent, "allow-recursion", allowRecursion);
    nextContent = upsertSimpleDirective(nextContent, "querylog", "yes");

    return nextContent;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const content =
        activeTab === "advanced"
          ? optionsContent
          : mergeFormIntoOptionsContent(optionsContent);
      await saveConfig("options", content);
      setOptionsContent(content);
      parseConfigForForm(content);
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
    const content = mergeFormIntoOptionsContent(optionsContent);
    setOptionsContent(content);
    return content;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading configuration"
          description="Reading the current named.conf.options content and parsing editable settings."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Server Configuration"
          description="Manage global BIND9 options, forwarders, ACL defaults, and raw options content."
          icon={ServerCog}
          badge={
            <Badge variant="outline" className="border-border/70 bg-background/70">
              named.conf.options
            </Badge>
          }
          actions={
            isAdmin ? (
              <Button
                onClick={handleSave}
                disabled={saving}
                variant={saved ? "outline" : "default"}
                className={
                  saved
                    ? "h-10 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-none"
                    : "h-10 rounded-xl bg-[linear-gradient(180deg,hsl(var(--primary)/0.95),hsl(var(--accent)/0.84))] text-primary-foreground shadow-[0_16px_40px_hsl(var(--primary)/0.22)]"
                }
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saved ? "Configuration Saved" : "Save Changes"}
              </Button>
            ) : null
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 h-auto rounded-2xl border border-border/60 bg-card/70 p-1">
            <TabsTrigger value="general" className="gap-2 rounded-xl">
              <Network className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 rounded-xl">
              <ShieldCheck className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2 rounded-xl">
              <FileJson className="h-4 w-4" />
              Raw Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Network className="h-5 w-5 text-primary" />
                    Listening Interfaces
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure the network interfaces BIND9 should listen on.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      IPv4 Interfaces
                    </Label>
                    <Input
                      className="font-mono"
                      value={listenV4}
                      onChange={(e) => setListenV4(e.target.value)}
                      placeholder="any;"
                    />
                    <p className="text-xs text-muted-foreground">
                      Example: <code className="rounded bg-muted px-1">192.168.1.5; 127.0.0.1;</code> or{" "}
                      <code className="rounded bg-muted px-1">any;</code>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      IPv6 Interfaces
                    </Label>
                    <Input
                      className="font-mono"
                      value={listenV6}
                      onChange={(e) => setListenV6(e.target.value)}
                      placeholder="any;"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ServerCog className="h-5 w-5 text-green-600" />
                    Forwarding
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Upstream DNS servers for recursive lookups.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Forwarder IPs
                    </Label>
                    <textarea
                      className="flex min-h-[60px] w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={forwarders}
                      onChange={(e) => setForwarders(e.target.value)}
                      placeholder="8.8.8.8;"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter one IP per line or semicolon separated.
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 p-3">
                    <div>
                      <Label htmlFor="forwardOnlySwitch" className="cursor-pointer font-medium">
                        Forward Only
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Disable recursion if forwarders fail
                      </p>
                    </div>
                    <Switch
                      id="forwardOnlySwitch"
                      checked={forwardOnly}
                      onCheckedChange={setForwardOnly}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="text-end">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={() => {
                  buildConfigFromForm();
                  setActiveTab("advanced");
                }}
              >
                Generate & Preview Config
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-5 w-5 text-red-600" />
                    Access Control Lists (ACLs)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Restrict who can query or transfer zones.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Allow Query
                    </Label>
                    <Input
                      className="font-mono"
                      value={allowQuery}
                      onChange={(e) => setAllowQuery(e.target.value)}
                      placeholder="any;"
                    />
                    <p className="text-xs text-muted-foreground">
                      Who can ask this server to resolve names.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Allow Recursion
                    </Label>
                    <Input
                      className="font-mono"
                      value={allowRecursion}
                      onChange={(e) => setAllowRecursion(e.target.value)}
                      placeholder="trusted;"
                    />
                    <p className="text-xs text-muted-foreground">
                      Who can use this server to find names it does not own.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Allow Transfer
                    </Label>
                    <Input
                      className="font-mono"
                      value={allowTransfer}
                      onChange={(e) => setAllowTransfer(e.target.value)}
                      placeholder="none;"
                    />
                    <p className="text-xs text-muted-foreground">
                      Secondary servers allowed to copy zone data.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    DNSSEC Validation
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enhance security by validating DNS signatures.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 p-3">
                    <div>
                      <Label htmlFor="dnssecSwitch" className="cursor-pointer font-medium">
                        Enable Validation
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Prevents connection to spoofed or poisoned domains
                      </p>
                    </div>
                    <Switch
                      id="dnssecSwitch"
                      checked={dnssecEnabled}
                      onCheckedChange={setDnssecEnabled}
                    />
                  </div>

                  {!dnssecEnabled ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Security Warning</AlertTitle>
                      <AlertDescription>
                        Disabling DNSSEC removes protection against cache poisoning attacks. This is
                        generally not recommended for production servers.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </div>
            <div className="text-end">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={() => {
                  buildConfigFromForm();
                  setActiveTab("advanced");
                }}
              >
                Generate & Preview Config
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="advanced">
            <Card className="linear-panel overflow-hidden border-border/60 bg-card/78 text-foreground shadow-none">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/60">
                <div>
                  <CardTitle className="tracking-[-0.04em]">Raw Configuration</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Directly edit{" "}
                    <code className="rounded bg-background/80 px-1">named.conf.options</code>.
                  </p>
                </div>
                <Badge variant="outline" className="border-border/70 bg-background/70 font-mono">
                  options block
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <textarea
                  className="w-full resize-y rounded-none border-0 bg-transparent p-4 font-mono text-sm text-foreground shadow-none focus:outline-none focus:ring-0"
                  value={optionsContent}
                  onChange={(e) => setOptionsContent(e.target.value)}
                  spellCheck={false}
                  rows={20}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
