import { useState } from "react";
import { Check, Copy, ExternalLink, FileEdit, Globe, LayoutGrid, List as ListIcon, Loader2, MoreHorizontal, RefreshCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageState } from "@/components/layout";
import type { ZoneData } from "@/lib/api";

interface ZonesInventoryCardProps {
  zones: ZoneData[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  loading: boolean;
  canManageDNS: boolean;
  replicationSavingId: string | null;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onEditZone: (zone: ZoneData) => void;
  onDeleteZone: (zone: ZoneData) => void;
  onToggleReplication: (zone: ZoneData) => void;
  statusColor: (status: string) => string;
}

export function ZonesInventoryCard({
  zones,
  searchTerm,
  onSearchTermChange,
  viewMode,
  onViewModeChange,
  loading,
  canManageDNS,
  replicationSavingId,
  onRefresh,
  onOpenCreate,
  onEditZone,
  onDeleteZone,
  onToggleReplication,
  statusColor,
}: ZonesInventoryCardProps) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | "master" | "forward" | "reverse" | "rpz">("all");
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const handleCopy = (domain: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(domain);
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 1500);
  };

  const filteredZones = zones.filter((zone) => {
    if (categoryFilter === "master") return zone.type === "master" && !zone.domain.includes("in-addr.arpa") && !zone.domain.includes("rpz");
    if (categoryFilter === "forward") return zone.type === "forward";
    if (categoryFilter === "reverse") return zone.domain.includes("in-addr.arpa") || zone.domain.includes("ip6.arpa");
    if (categoryFilter === "rpz") return zone.domain.includes("rpz");
    return true;
  });

  const countMaster = zones.filter((z) => z.type === "master" && !z.domain.includes("in-addr.arpa") && !z.domain.includes("rpz")).length;
  const countForward = zones.filter((z) => z.type === "forward").length;
  const countReverse = zones.filter((z) => z.domain.includes("in-addr.arpa") || z.domain.includes("ip6.arpa")).length;
  const countRpz = zones.filter((z) => z.domain.includes("rpz")).length;

  return (
    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1" style={{ maxWidth: "340px" }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="pl-9 h-9 rounded-xl border-border/70 bg-background/60 font-mono text-sm"
              placeholder="Filtrer par nom de domaine..."
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              title="Actualiser"
              onClick={onRefresh}
              disabled={loading}
              className="h-9 gap-1.5 rounded-xl border-border/70 bg-background/60"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-xs">Actualiser</span>
            </Button>
            <div className="flex rounded-xl border border-border/70 bg-background/50 p-0.5">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-lg px-2.5"
                onClick={() => onViewModeChange("grid")}
                title="Vue en grille"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-lg px-2.5"
                onClick={() => onViewModeChange("list")}
                title="Vue en liste"
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Toutes ({zones.length})
          </button>
          <button
            onClick={() => setCategoryFilter("master")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "master"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Primaires / Master ({countMaster})
          </button>
          <button
            onClick={() => setCategoryFilter("forward")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "forward"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Forwarders ({countForward})
          </button>
          <button
            onClick={() => setCategoryFilter("reverse")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "reverse"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Reverse PTR ({countReverse})
          </button>
          <button
            onClick={() => setCategoryFilter("rpz")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "rpz"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            RPZ Firewall ({countRpz})
          </button>
        </div>
      </CardHeader>

      {filteredZones.length === 0 ? (
        <div className="p-6">
          <PageState
            title={searchTerm || categoryFilter !== "all" ? "Aucune zone ne correspond aux filtres" : "Aucune zone configurée"}
            description={
              searchTerm || categoryFilter !== "all"
                ? "Essayez de modifier votre recherche ou de réinitialiser le filtre de catégorie."
                : "Créez votre première zone ou synchronisez l'inventaire BIND9 existant."
            }
            action={
              searchTerm || categoryFilter !== "all" ? (
                <div className="flex gap-2">
                  {searchTerm && (
                    <Button variant="outline" size="sm" onClick={() => onSearchTermChange("")}>
                      Effacer la recherche
                    </Button>
                  )}
                  {categoryFilter !== "all" && (
                    <Button variant="outline" size="sm" onClick={() => setCategoryFilter("all")}>
                      Toutes les catégories
                    </Button>
                  )}
                </div>
              ) : canManageDNS ? (
                <Button onClick={onOpenCreate}>Ajouter une zone</Button>
              ) : null
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        <CardContent className="bg-muted/20 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredZones.map((zone) => {
              const isReverse = zone.domain.includes("in-addr.arpa") || zone.domain.includes("ip6.arpa");
              const isRpz = zone.domain.includes("rpz");
              const isCopied = copiedDomain === zone.domain;

              const getBadgeStyle = () => {
                if (isRpz) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
                if (isReverse) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
                if (zone.type === "forward") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
                if (zone.type === "slave") return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
                return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
              };

              const getBadgeLabel = () => {
                if (isRpz) return "RPZ Firewall";
                if (isReverse) return "Reverse PTR";
                if (zone.type === "forward") return "Forwarder";
                if (zone.type === "slave") return "Slave";
                return "Master";
              };

              return (
                <Card
                  key={zone.id}
                  onClick={() => onEditZone(zone)}
                  className="group relative cursor-pointer overflow-hidden border-border/70 bg-card/80 transition-all duration-200 hover:border-primary/50 hover:bg-card/95 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div
                    className={`absolute left-0 top-0 h-full ${statusColor(zone.status)}`}
                    style={{ width: "3px" }}
                  />
                  <CardContent className="p-4 pl-5">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-primary transition-colors group-hover:border-primary/40 group-hover:bg-primary/10">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h5
                              className="truncate font-mono text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary"
                              title={zone.domain}
                            >
                              {zone.domain}
                            </h5>
                            <button
                              type="button"
                              onClick={(e) => handleCopy(zone.domain, e)}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Copier le nom de domaine"
                            >
                              {isCopied ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <Badge variant="outline" className={`mt-1 text-[10px] font-semibold tracking-wider uppercase ${getBadgeStyle()}`}>
                            {getBadgeLabel()}
                          </Badge>
                        </div>
                      </div>

                      {canManageDNS && zone.type === "master" && (
                        <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => onEditZone(zone)}
                            title="Gérer les enregistrements"
                          >
                            <FileEdit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteZone(zone)}
                            title="Supprimer la zone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                        <span className="block text-[10px] font-medium uppercase text-muted-foreground">Enregistrements</span>
                        <span className="font-mono text-sm font-bold text-foreground">{zone.records}</span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                        <span className="block text-[10px] font-medium uppercase text-muted-foreground">Série (Serial)</span>
                        <span className="truncate font-mono text-xs font-semibold text-foreground">{zone.serial || "-"}</span>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${statusColor(zone.status)}`} />
                        <span className="capitalize text-muted-foreground text-[11px] font-medium">{zone.status}</span>
                        {zone.type === "master" && (
                          <button
                            type="button"
                            className={`ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              zone.replicationEnabled !== false
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-muted text-muted-foreground line-through"
                            }`}
                            title={
                              zone.replicationEnabled !== false
                                ? "Réplication active (cliquer pour désactiver)"
                                : "Réplication désactivée (cliquer pour activer)"
                            }
                            disabled={replicationSavingId === zone.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleReplication(zone);
                            }}
                          >
                            {replicationSavingId === zone.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Repl
                          </button>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Explorer <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="h-9 px-4 text-left">Zone / Domaine</th>
                <th className="h-9 px-4 text-left">Type</th>
                <th className="h-9 px-4 text-left">Enregistrements</th>
                <th className="h-9 px-4 text-left">Numéro Série</th>
                <th className="h-9 px-4 text-left">Statut</th>
                {canManageDNS && (
                  <th className="h-9 px-4 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredZones.map((zone) => {
                const isReverse = zone.domain.includes("in-addr.arpa") || zone.domain.includes("ip6.arpa");
                const isRpz = zone.domain.includes("rpz");
                const isCopied = copiedDomain === zone.domain;

                const getBadgeStyle = () => {
                  if (isRpz) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
                  if (isReverse) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
                  if (zone.type === "forward") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
                  if (zone.type === "slave") return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
                  return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
                };

                const getBadgeLabel = () => {
                  if (isRpz) return "RPZ";
                  if (isReverse) return "Reverse";
                  if (zone.type === "forward") return "Forward";
                  if (zone.type === "slave") return "Slave";
                  return "Master";
                };

                return (
                  <tr
                    key={zone.id}
                    onClick={() => onEditZone(zone)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-primary">
                          <Globe className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground">
                          <span>{zone.domain}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(zone.domain, e)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Copier le nom de domaine"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${getBadgeStyle()}`}>
                        {getBadgeLabel()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">{zone.records}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{zone.serial || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${statusColor(zone.status)}`} />
                        <span className="capitalize text-xs text-muted-foreground">{zone.status}</span>
                      </div>
                    </td>
                    {canManageDNS && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2" onClick={() => onEditZone(zone)}>
                              <FileEdit className="h-4 w-4" /> Gérer les enregistrements
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onClick={() => onDeleteZone(zone)}
                            >
                              <Trash2 className="h-4 w-4" /> Supprimer la zone
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
