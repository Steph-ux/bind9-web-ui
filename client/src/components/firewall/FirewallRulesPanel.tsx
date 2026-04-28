import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

import type { FirewallStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { ruleTypeLabel } from "./constants";

interface FirewallRulesPanelProps {
  status: FirewallStatus;
  onCreateRule: () => void;
  onDeleteRule: (id: number) => void;
}

export function FirewallRulesPanel({
  status,
  onCreateRule,
  onDeleteRule,
}: FirewallRulesPanelProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h5 className="flex items-center gap-2 font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          {status.active ? "Active Rules" : "Configured Rules"}
          <Badge variant="secondary" className="font-mono text-xs">
            {status.rules.length}
          </Badge>
        </h5>
        <Button className="gap-2" onClick={onCreateRule}>
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {status.rules.length === 0 ? (
        <Card className="border-dashed py-8 text-center">
          <CardContent>
            <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/25" />
            <h5 className="font-semibold">No Rules Defined</h5>
            <p className="mb-4 text-muted-foreground">
              Your firewall policy is empty. Add rules to explicitly allow traffic to your services.
            </p>
            <Button variant="outline" onClick={onCreateRule}>
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {status.rules.map((rule) => {
            const isAllow = rule.action === "ALLOW" || rule.action === "LIMIT";
            const isLimit = rule.action === "LIMIT";

            return (
              <Card key={rule.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-md ${
                          isAllow
                            ? isLimit
                              ? "bg-yellow-500/10 text-yellow-600"
                              : "bg-green-500/10 text-green-600"
                            : "bg-red-500/10 text-red-600"
                        }`}
                      >
                        {isAllow ? (
                          isLimit ? (
                            <Zap className="h-4 w-4" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <code className="block text-base font-bold">
                          {rule.ruleType === "service" && rule.service ? rule.service : rule.to}
                        </code>
                        <div className="flex items-center gap-1.5">
                          <small className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {rule.action}
                          </small>
                          <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]">
                            {rule.direction === "out" ? "OUT" : "IN"}
                          </Badge>
                          <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]">
                            {ruleTypeLabel(rule.ruleType)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onDeleteRule(rule.id)}
                      title="Delete Rule"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  <div className="my-2 border-t" />

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {rule.direction === "out" ? (
                          <ArrowLeft className="h-3 w-3" />
                        ) : (
                          <ArrowRight className="h-3 w-3" />
                        )}
                        From:
                      </span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {rule.from}
                        {rule.ipv6 ? <span className="ml-1 opacity-60">(v6)</span> : null}
                      </Badge>
                    </div>

                    {rule.proto && rule.proto !== "any" ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Protocol:</span>
                        <span className="font-mono text-xs">{rule.proto.toUpperCase()}</span>
                      </div>
                    ) : null}

                    {rule.interface ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Interface:</span>
                        <span className="font-mono text-xs">{rule.interface}</span>
                      </div>
                    ) : null}

                    {rule.rateLimit ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          Limit:
                        </span>
                        <span className="font-mono text-xs">{rule.rateLimit}</span>
                      </div>
                    ) : null}

                    {rule.icmpType ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">ICMP:</span>
                        <span className="font-mono text-xs">{rule.icmpType}</span>
                      </div>
                    ) : null}

                    {rule.log ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Logging:</span>
                        <Badge variant="outline" className="px-1 py-0 text-[9px]">
                          ON
                        </Badge>
                      </div>
                    ) : null}

                    {rule.comment ? (
                      <div className="mt-1 border-t pt-1.5 text-xs italic text-muted-foreground">
                        "{rule.comment}"
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    <span>Rule #{rule.id}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
