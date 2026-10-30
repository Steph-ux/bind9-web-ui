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
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h5 className="flex items-center gap-2 font-semibold text-sm">
          <Activity className="h-4 w-4 text-primary" />
          {status.active ? t.firewall.activeRules : t.firewall.configuredRules}
          <Badge variant="secondary" className="font-mono text-xs">
            {status.rules.length}
          </Badge>
        </h5>
        <Button
          className="gap-2 text-xs h-9"
          onClick={onCreateRule}
          disabled={!status.installed}
        >
          <Plus className="h-4 w-4" />
          {t.firewall.addRule}
        </Button>
      </div>

      {status.rules.length === 0 ? (
        <Card className="border-dashed py-8 text-center bg-card/50">
          <CardContent>
            <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/25" />
            <h5 className="font-semibold text-sm">{t.firewall.noRulesTitle}</h5>
            <p className="mb-4 text-xs text-muted-foreground max-w-md mx-auto">
              {status.installed
                ? t.firewall.noRulesDesc
                : t.firewall.installSupported}
            </p>
            {status.installed && (
              <Button variant="outline" size="sm" onClick={onCreateRule}>
                {t.firewall.createFirstRule}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {status.rules.map((rule) => {
            const isAllow = rule.action === "ALLOW" || rule.action === "LIMIT";
            const isLimit = rule.action === "LIMIT";

            return (
              <Card key={rule.id} className="overflow-hidden bg-card/75 border-border/60 shadow-none">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isAllow
                            ? isLimit
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-emerald-500/10 text-emerald-500"
                            : "bg-rose-500/10 text-rose-500"
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
                        <code className="block text-sm font-bold">
                          {rule.ruleType === "service" && rule.service ? rule.service : rule.to}
                        </code>
                        <div className="flex items-center gap-1.5 mt-0.5">
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
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteRule(rule.id)}
                      title={t.firewall.deleteRuleBtn}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="my-2 border-t border-border/50" />

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {rule.direction === "out" ? (
                          <ArrowLeft className="h-3 w-3" />
                        ) : (
                          <ArrowRight className="h-3 w-3" />
                        )}
                        {t.firewall.ruleFrom}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {rule.from}
                        {rule.ipv6 ? <span className="ml-1 opacity-60">(v6)</span> : null}
                      </Badge>
                    </div>

                    {rule.proto && rule.proto !== "any" ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t.firewall.ruleProtocol}</span>
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
                      <div className="mt-1 border-t border-border/40 pt-1.5 text-[11px] italic text-muted-foreground">
                        "{rule.comment}"
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/70 font-mono">
                    <span>{t.firewall.ruleNum}{rule.id}</span>
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
