import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Shield } from "lucide-react";

import { PageHeader, PageState } from "@/components/layout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { RpzImportDialog } from "@/components/firewall-dns/RpzImportDialog";
import { RpzRuleFormCard } from "@/components/firewall-dns/RpzRuleFormCard";
import { RpzRulesTableCard } from "@/components/firewall-dns/RpzRulesTableCard";
import { RpzStatsCards } from "@/components/firewall-dns/RpzStatsCards";
import type { RpzEntryDraft, RpzTypeFilter } from "@/components/firewall-dns/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    clearRpzEntries,
    createRpzEntry,
    deleteRpzEntry,
    getStatus,
    getRpzEntries,
    getRpzStats,
    importRpzEntries,
    importRpzEntriesFromUrl,
    type RpzEntriesResponse,
    type RpzStats,
    type StatusData,
    syncRpzEntries,
} from "@/lib/api";

const PAGE_SIZE = 50;

const EMPTY_ENTRY: RpzEntryDraft = {
    name: "",
    type: "nxdomain",
    target: "",
    comment: "",
};

export default function FirewallDNS() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [clearAllOpen, setClearAllOpen] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchFilter, setSearchFilter] = useState("");
    const [page, setPage] = useState(1);
    const [typeFilter, setTypeFilter] = useState<RpzTypeFilter>("all");

    const [importOpen, setImportOpen] = useState(false);
    const [importTab, setImportTab] = useState("text");
    const [importText, setImportText] = useState("");
    const [importSourceName, setImportSourceName] = useState("");
    const [importUrl, setImportUrl] = useState("");
    const [importUrlSource, setImportUrlSource] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [newEntry, setNewEntry] = useState<RpzEntryDraft>(EMPTY_ENTRY);

    useEffect(() => {
        const timer = setTimeout(() => setSearchFilter(searchInput.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const { data: pagedData, isLoading, error: queryError } = useQuery<RpzEntriesResponse>({
        queryKey: ["/api/rpz", { page, search: searchFilter, type: typeFilter }],
        queryFn: () => getRpzEntries({ page, limit: PAGE_SIZE, search: searchFilter, type: typeFilter }),
        placeholderData: (previousData) => previousData,
    });

    const { data: stats } = useQuery<RpzStats>({
        queryKey: ["/api/rpz/stats"],
        queryFn: getRpzStats,
    });

    const { data: statusData } = useQuery<StatusData>({
        queryKey: ["/api/status", "rpz-scope"],
        queryFn: getStatus,
        staleTime: 10_000,
    });

    const entries = pagedData?.entries ?? [];
    const totalEntries = pagedData?.total ?? 0;
    const totalPages = pagedData?.totalPages ?? 1;
    const rpzSummary = statusData?.management?.rpz;
    const multipleRpzZones = Boolean(rpzSummary?.zoneName?.includes(","));

    const invalidateRpzQueries = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
        queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
    };

    const createMutation = useMutation({
        mutationFn: createRpzEntry,
        onSuccess: () => {
            invalidateRpzQueries();
            toast({ title: "Rule added", description: "The DNS firewall rule has been added and applied." });
            setNewEntry(EMPTY_ENTRY);
        },
        onError: (error: Error) => {
            toast({ title: "Failed to add rule", description: error.message, variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteRpzEntry,
        onSuccess: () => {
            invalidateRpzQueries();
            setDeleteTarget(null);
            toast({ title: "Rule deleted", description: "The DNS firewall rule has been removed." });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to delete rule", description: error.message, variant: "destructive" });
        },
    });

    const clearAllMutation = useMutation({
        mutationFn: clearRpzEntries,
        onSuccess: () => {
            invalidateRpzQueries();
            setClearAllOpen(false);
            toast({ title: "All rules cleared", description: "All DNS firewall rules have been removed." });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to clear rules", description: error.message, variant: "destructive" });
        },
    });

    const syncMutation = useMutation({
        mutationFn: syncRpzEntries,
        onSuccess: (data) => {
            invalidateRpzQueries();
            toast({ title: "Sync complete", description: data.message });
        },
        onError: (error: Error) => {
            toast({ title: "Sync failed", description: error.message, variant: "destructive" });
        },
    });

    const importMutation = useMutation({
        mutationFn: importRpzEntries,
        onSuccess: (data) => {
            invalidateRpzQueries();
            setImportOpen(false);
            setImportText("");
            setImportSourceName("");
            toast({
                title: "Import complete",
                description: `${data.imported} entries imported, ${data.duplicates} duplicates skipped`,
            });
        },
        onError: (error: Error) => {
            toast({ title: "Import failed", description: error.message, variant: "destructive" });
        },
    });

    const importUrlMutation = useMutation({
        mutationFn: importRpzEntriesFromUrl,
        onSuccess: (data) => {
            invalidateRpzQueries();
            setImportOpen(false);
            setImportUrl("");
            setImportUrlSource("");
            toast({
                title: "URL import complete",
                description: `${data.imported} entries imported, ${data.duplicates} duplicates skipped`,
            });
        },
        onError: (error: Error) => {
            toast({ title: "URL import failed", description: error.message, variant: "destructive" });
        },
    });

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.size > 200 * 1024 * 1024) {
            toast({ title: "File too large", description: "Maximum file size is 200MB", variant: "destructive" });
            return;
        }

        const chunkSize = 4 * 1024 * 1024;
        let result = "";
        let offset = 0;
        const reader = new FileReader();

        reader.onload = (loadEvent) => {
            result += (loadEvent.target?.result as string) ?? "";
            offset += chunkSize;
            if (offset < file.size) {
                reader.readAsText(file.slice(offset, offset + chunkSize));
            } else {
                setImportText(result);
                setImportSourceName(file.name);
                setImportTab("text");
            }
        };

        reader.onerror = () => {
            toast({ title: "File read error", description: "Failed to read the uploaded file", variant: "destructive" });
        };

        reader.readAsText(file.slice(0, chunkSize));
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!newEntry.name.trim()) {
            return;
        }

        if (newEntry.type === "redirect" && !newEntry.target.trim()) {
            toast({
                title: "Target required",
                description: "Please specify a target IP or domain for redirection.",
                variant: "destructive",
            });
            return;
        }

        createMutation.mutate({
            name: newEntry.name.trim(),
            type: newEntry.type,
            target: newEntry.type === "redirect" ? newEntry.target.trim() : undefined,
            comment: newEntry.comment.trim() || undefined,
        });
    };

    const handleImportText = () => {
        if (!importText.trim()) {
            toast({ title: "No content", description: "Paste or upload blocklist content first", variant: "destructive" });
            return;
        }
        importMutation.mutate({
            content: importText,
            sourceName: importSourceName.trim() || "manual-import",
        });
    };

    const handleImportUrl = () => {
        if (!importUrl.trim()) {
            toast({ title: "No URL", description: "Enter a blocklist URL first", variant: "destructive" });
            return;
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(importUrl.trim());
        } catch {
            toast({ title: "Invalid URL", description: "Enter a valid http or https URL.", variant: "destructive" });
            return;
        }

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            toast({ title: "Invalid URL", description: "Only http and https URLs are allowed.", variant: "destructive" });
            return;
        }

        importUrlMutation.mutate({
            url: parsedUrl.toString(),
            sourceName: importUrlSource.trim() || parsedUrl.hostname,
        });
    };

    const handleSearch = useCallback((value: string) => {
        setSearchInput(value);
        setPage(1);
    }, []);

    const handleTypeFilter = useCallback((value: RpzTypeFilter) => {
        setTypeFilter(value);
        setPage(1);
    }, []);

    if (isLoading) {
        return (
            <DashboardLayout>
                <PageState
                    loading
                    title="Loading DNS firewall"
                    description="Fetching RPZ rules, counters and policy details."
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    if (queryError) {
        const message = queryError instanceof Error ? queryError.message : "An unexpected error occurred.";

        return (
            <DashboardLayout>
                <PageState
                    title="Failed to load firewall rules"
                    description={message}
                    tone="danger"
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/rpz"] })}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                        </Button>
                    }
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <PageHeader
                    title="DNS Firewall (RPZ)"
                    description="Manage Response Policy Zones to block, redirect or null-route malicious domains."
                    icon={Shield}
                    badge={
                        <Badge variant="outline">
                            {stats?.total ?? 0} rule{(stats?.total ?? 0) !== 1 ? "s" : ""}
                        </Badge>
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            <RpzImportDialog
                                open={importOpen}
                                onOpenChange={setImportOpen}
                                importTab={importTab}
                                onImportTabChange={setImportTab}
                                importText={importText}
                                onImportTextChange={setImportText}
                                importSourceName={importSourceName}
                                onImportSourceNameChange={setImportSourceName}
                                importUrl={importUrl}
                                onImportUrlChange={setImportUrl}
                                importUrlSource={importUrlSource}
                                onImportUrlSourceChange={setImportUrlSource}
                                fileInputRef={fileInputRef}
                                onFileUpload={handleFileUpload}
                                onClearLoadedFile={() => {
                                    setImportText("");
                                    setImportSourceName("");
                                }}
                                onImportText={handleImportText}
                                onImportUrl={handleImportUrl}
                                importPending={importMutation.isPending}
                                importUrlPending={importUrlMutation.isPending}
                            />
                        </div>
                    }
                />

                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>How it works</AlertTitle>
                    <AlertDescription>
                        DNS Firewall rules intercept queries for specific domains.{" "}
                        <span className="font-semibold">NXDOMAIN</span> returns "Not Found",{" "}
                        <span className="font-semibold">NODATA</span> returns no records, and{" "}
                        <span className="font-semibold">REDIRECT</span> sends traffic to a different IP or domain.
                    </AlertDescription>
                </Alert>

                {rpzSummary?.configured ? (
                    <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Server-side RPZ detected</AlertTitle>
                        <AlertDescription>
                            The active server already exposes the following response-policy zone set:
                            <span className="mx-1 font-mono">{rpzSummary.zoneName}</span>.
                            This screen now keeps the synchronized inventory with a source-zone marker for each
                            rule. New rules and imports are assigned to the primary managed RPZ zone unless a
                            source zone already exists.
                            {multipleRpzZones ? " Multiple RPZ zones are active, so the table shows which zone each synchronized rule came from." : ""}
                        </AlertDescription>
                    </Alert>
                ) : null}

                <RpzStatsCards stats={stats} />

                <div className="grid gap-6 md:grid-cols-12">
                    <RpzRuleFormCard
                        className="md:col-span-4"
                        entry={newEntry}
                        onEntryChange={setNewEntry}
                        onSubmit={handleSubmit}
                        createPending={createMutation.isPending}
                        syncPending={syncMutation.isPending}
                        clearPending={clearAllMutation.isPending}
                        totalRules={stats?.total ?? 0}
                        onSync={() => syncMutation.mutate()}
                        onClearAll={() => setClearAllOpen(true)}
                    />

                    <RpzRulesTableCard
                        className="md:col-span-8"
                        entries={entries}
                        totalEntries={totalEntries}
                        page={page}
                        pageSize={PAGE_SIZE}
                        totalPages={totalPages}
                        typeFilter={typeFilter}
                        onTypeFilterChange={handleTypeFilter}
                        searchInput={searchInput}
                        onSearchChange={handleSearch}
                        deletePending={deleteMutation.isPending}
                        onDeleteRequest={setDeleteTarget}
                        onPreviousPage={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                        onNextPage={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                    />
                </div>
            </div>

            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete DNS Firewall Rule</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this rule? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
                        >
                            Delete Rule
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear All DNS Firewall Rules</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete all {stats?.total ?? 0} rules? This will remove the entire RPZ
                            blocklist and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => clearAllMutation.mutate()}
                        >
                            Clear All Rules
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
