import { useState } from "react";
import { Check, Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecordData } from "@/lib/api";

interface ZoneRecordsTabProps {
  records: RecordData[];
  zoneDomain?: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  canManageDNS: boolean;
  onEditRecord: (record: RecordData) => void;
  onDeleteRecord: (record: RecordData) => void;
  onOpenCreate?: () => void;
}

type RecordCategory = "all" | "a_aaaa" | "cname" | "mx" | "txt" | "ns_soa" | "other";

export function ZoneRecordsTab({
  records,
  zoneDomain,
  searchTerm,
  onSearchTermChange,
  canManageDNS,
  onEditRecord,
  onDeleteRecord,
  onOpenCreate,
}: ZoneRecordsTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<RecordCategory>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getFQDN = (name: string): string => {
    if (!zoneDomain) return name;
    if (name === "@" || !name) return `${zoneDomain}.`;
    if (name.endsWith(".")) return name;
    return `${name}.${zoneDomain}.`;
  };

  const getRecordBadge = (type: string): string => {
    switch (type.toUpperCase()) {
      case "A":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "AAAA":
        return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
      case "CNAME":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "MX":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "TXT":
        return "bg-purple-500/15 text-purple-400 border-purple-500/30";
      case "NS":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "PTR":
        return "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30";
      case "SRV":
        return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
      case "SOA":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
      default:
        return "bg-muted text-muted-foreground border-border/60";
    }
  };

  const getTxtSubtype = (val: string, name: string): { label: string; color: string } | null => {
    const lower = val.toLowerCase();
    if (lower.startsWith("v=spf1")) {
      return { label: "SPF", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    }
    if (lower.startsWith("v=dmarc1")) {
      return { label: "DMARC", color: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
    }
    if (lower.includes("v=dkim1") || lower.includes("p=") || name.toLowerCase().includes("_domainkey")) {
      return { label: "DKIM", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" };
    }
    return null;
  };

  const formatTTL = (ttl: number | string): string => {
    const seconds = typeof ttl === "string" ? parseInt(ttl, 10) : ttl;
    if (isNaN(seconds)) return String(ttl);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${seconds}s (${Math.round(seconds / 60)}m)`;
    if (seconds < 86400) return `${seconds}s (${Math.round(seconds / 3600)}h)`;
    return `${seconds}s (${Math.round(seconds / 86400)}j)`;
  };

  const filteredRecords = records.filter((r) => {
    if (categoryFilter === "a_aaaa") return r.type === "A" || r.type === "AAAA";
    if (categoryFilter === "cname") return r.type === "CNAME";
    if (categoryFilter === "mx") return r.type === "MX";
    if (categoryFilter === "txt") return r.type === "TXT";
    if (categoryFilter === "ns_soa") return r.type === "NS" || r.type === "SOA";
    if (categoryFilter === "other") return !["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"].includes(r.type);
    return true;
  });

  const countA = records.filter((r) => r.type === "A" || r.type === "AAAA").length;
  const countCname = records.filter((r) => r.type === "CNAME").length;
  const countMx = records.filter((r) => r.type === "MX").length;
  const countTxt = records.filter((r) => r.type === "TXT").length;
  const countNsSoa = records.filter((r) => r.type === "NS" || r.type === "SOA").length;
  const countOther = records.filter((r) => !["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"].includes(r.type)).length;

  return (
    <div className="space-y-4">
      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/78 p-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1" style={{ maxWidth: "360px" }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, valeur ou IP..."
              className="pl-9 h-9 rounded-xl border-border/70 bg-background/60 font-mono text-sm"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filteredRecords.length} / {records.length} enregistrements affichés
            </span>
            {canManageDNS && onOpenCreate && (
              <Button size="sm" onClick={onOpenCreate} className="h-9 gap-1.5 rounded-xl">
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter</span>
              </Button>
            )}
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
            Tous ({records.length})
          </button>
          <button
            onClick={() => setCategoryFilter("a_aaaa")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "a_aaaa"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            A / AAAA ({countA})
          </button>
          <button
            onClick={() => setCategoryFilter("cname")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "cname"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            CNAME ({countCname})
          </button>
          <button
            onClick={() => setCategoryFilter("mx")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "mx"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            MX ({countMx})
          </button>
          <button
            onClick={() => setCategoryFilter("txt")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "txt"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            TXT / Sécurité ({countTxt})
          </button>
          <button
            onClick={() => setCategoryFilter("ns_soa")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
              categoryFilter === "ns_soa"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            NS & SOA ({countNsSoa})
          </button>
          {countOther > 0 && (
            <button
              onClick={() => setCategoryFilter("other")}
              className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
                categoryFilter === "other"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              Autres ({countOther})
            </button>
          )}
        </div>
      </div>

      {/* Records Table */}
      <Card className="border-border/60 bg-card/78 shadow-none">
        <Table>
          <TableHeader>
            <tr className="border-b border-border/60 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <TableHead className="h-9 px-4 text-left">Nom & FQDN</TableHead>
              <TableHead className="h-9 px-4 text-left">Type</TableHead>
              <TableHead className="h-9 px-4 text-left">Cible / Valeur</TableHead>
              <TableHead className="h-9 px-4 text-left">TTL</TableHead>
              <TableHead className="h-9 px-4 text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-border/40">
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-sm">Aucun enregistrement ne correspond aux critères.</p>
                    {(searchTerm || categoryFilter !== "all") && (
                      <div className="flex gap-2">
                        {searchTerm && (
                          <Button variant="outline" size="sm" onClick={() => onSearchTermChange("")}>
                            Effacer recherche
                          </Button>
                        )}
                        {categoryFilter !== "all" && (
                          <Button variant="outline" size="sm" onClick={() => setCategoryFilter("all")}>
                            Toutes catégories
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => {
                const isNameCopied = copiedId === `name-${record.id}`;
                const isValCopied = copiedId === `val-${record.id}`;
                const fqdn = getFQDN(record.name);
                const txtSubtype = record.type === "TXT" ? getTxtSubtype(record.value, record.name) : null;

                return (
                  <tr
                    key={record.id}
                    className="group border-b border-border/40 transition-colors hover:bg-muted/30"
                  >
                    {/* Name & FQDN */}
                    <TableCell className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {record.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(`name-${record.id}`, record.name, e)}
                            className="rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                            title="Copier le nom"
                          >
                            {isNameCopied ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        {zoneDomain && (
                          <span
                            className="truncate font-mono text-[11px] text-muted-foreground/80 max-w-[220px]"
                            title={fqdn}
                          >
                            {fqdn}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Type Badge */}
                    <TableCell className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono font-bold tracking-wider uppercase ${getRecordBadge(
                            record.type
                          )}`}
                        >
                          {record.type}
                        </Badge>
                        {txtSubtype && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-bold tracking-wider uppercase ${txtSubtype.color}`}
                          >
                            {txtSubtype.label}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Target / Value */}
                    <TableCell className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {record.priority != null && (
                          <Badge
                            variant="outline"
                            className="shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-semibold"
                          >
                            Prio {record.priority}
                          </Badge>
                        )}
                        <span
                          className="max-w-[340px] truncate font-mono text-xs text-foreground/90 select-all"
                          title={record.value}
                        >
                          {record.value}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(`val-${record.id}`, record.value, e)}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                          title="Copier la valeur"
                        >
                          {isValCopied ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>

                    {/* TTL */}
                    <TableCell className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                      {formatTTL(record.ttl)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="px-4 py-3 align-top text-right">
                      {record.type !== "SOA" && canManageDNS && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => onEditRecord(record)}
                            title="Modifier l'enregistrement"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteRecord(record)}
                            title="Supprimer l'enregistrement"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
