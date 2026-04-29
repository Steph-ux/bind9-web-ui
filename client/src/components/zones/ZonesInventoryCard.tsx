import { Copy, FileEdit, Globe, LayoutGrid, List as ListIcon, Loader2, MoreHorizontal, RefreshCcw, Search, Trash2 } from "lucide-react";
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
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="relative flex-1" style={{ maxWidth: "300px" }}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Search zones..."
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title="Refresh" onClick={onRefresh} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("grid")}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("list")}
              title="List View"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {zones.length === 0 ? (
        <div className="p-6">
          <PageState
            title={searchTerm ? "No zones match your search" : "No zones configured"}
            description={
              searchTerm
                ? "Try a different domain filter or clear the search field."
                : "Create your first zone or import the current BIND9 inventory."
            }
            action={
              searchTerm ? (
                <Button variant="outline" onClick={() => onSearchTermChange("")}>
                  Clear search
                </Button>
              ) : canManageDNS ? (
                <Button onClick={onOpenCreate}>Add New Zone</Button>
              ) : null
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        <CardContent className="bg-muted/30 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zones.map((zone) => (
              <Card key={zone.id} className="relative overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full ${statusColor(zone.status)}`}
                  style={{ width: "4px" }}
                />
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                        <Globe className="h-5 w-5" />
                      </div>
                      <div>
                        <h5
                          className="max-w-[160px] truncate font-mono text-sm font-medium"
                          title={zone.domain}
                        >
                          {zone.domain}
                        </h5>
                        <Badge variant="outline" className="mt-1 text-xs uppercase">
                          {zone.type}
                        </Badge>
                      </div>
                    </div>
                    {canManageDNS && zone.type === "master" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEditZone(zone)}
                          title="Edit Records"
                        >
                          <FileEdit className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDeleteZone(zone)}
                          title="Delete Zone"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border bg-muted/50 p-2">
                      <small className="mb-0.5 block text-[11px] text-muted-foreground">Records</small>
                      <span className="font-mono text-sm font-semibold">{zone.records}</span>
                    </div>
                    <div className="rounded-md border bg-muted/50 p-2">
                      <small className="mb-0.5 block text-[11px] text-muted-foreground">Serial</small>
                      <span className="font-mono text-sm font-semibold">{zone.serial || "-"}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 animate-pulse rounded-full ${statusColor(zone.status)}`} />
                      <small className="capitalize text-muted-foreground">{zone.status}</small>
                      {zone.type === "master" && (
                        <button
                          className={`ml-1 flex items-center gap-0.5 text-[10px] ${
                            zone.replicationEnabled !== false
                              ? "text-green-600"
                              : "text-muted-foreground line-through"
                          }`}
                          title={
                            zone.replicationEnabled !== false
                              ? "Replication enabled (click to disable)"
                              : "Replication disabled (click to enable)"
                          }
                          disabled={replicationSavingId === zone.id}
                          onClick={() => onToggleReplication(zone)}
                        >
                          {replicationSavingId === zone.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Repl
                        </button>
                      )}
                    </div>
                    {canManageDNS && zone.type === "master" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-primary"
                        onClick={() => onEditZone(zone)}
                      >
                        Manage <FileEdit className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Zone Name</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Records</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Serial</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                {canManageDNS && (
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id} className="border-b transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-mono font-medium">{zone.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {zone.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{zone.records}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{zone.serial || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 animate-pulse rounded-full ${statusColor(zone.status)}`} />
                      <span className="capitalize text-xs">{zone.status}</span>
                    </div>
                  </td>
                  {canManageDNS && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {zone.type === "master" && (
                            <DropdownMenuItem className="gap-2" onClick={() => onEditZone(zone)}>
                              <FileEdit className="h-4 w-4" /> Edit Records
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => onDeleteZone(zone)}
                          >
                            <Trash2 className="h-4 w-4" /> Delete Zone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
