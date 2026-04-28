import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader, PageState } from "@/components/layout";
import { Shield, Plus, Trash2, Globe, AlertTriangle, Loader2, Upload, Link, RefreshCw, FileText, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { RpzEntry, InsertRpzEntry } from "@shared/schema";

export default function FirewallDNS() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [clearAllOpen, setClearAllOpen] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchFilter, setSearchFilter] = useState("");
    const [page, setPage] = useState(1);

    // Debounce search: 300ms delay before triggering API query
    useEffect(() => {
        const timer = setTimeout(() => setSearchFilter(searchInput), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);
    const [typeFilter, setTypeFilter] = useState("all");
    const PAGE_SIZE = 50;
    const [importOpen, setImportOpen] = useState(false);
    const [importTab, setImportTab] = useState("text");
    const [importText, setImportText] = useState("");
    const [importSourceName, setImportSourceName] = useState("");
    const [importUrl, setImportUrl] = useState("");
    const [importUrlSource, setImportUrlSource] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [newEntry, setNewEntry] = useState<Partial<InsertRpzEntry>>({
        name: "",
        type: "nxdomain",
        target: "",
        comment: "",
    });

    const { data: pagedData, isLoading, error: queryError } = useQuery<{
        entries: RpzEntry[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>({
        queryKey: ["/api/rpz", { page, search: searchFilter, type: typeFilter }],
        queryFn: async () => {
            const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
            if (searchFilter) params.set("search", searchFilter);
            if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
            const res = await apiRequest("GET", `/api/rpz?${params}`);
            return res.json();
        },
        placeholderData: (prev) => prev,
    });

    const { data: stats } = useQuery<{ total: number; nxdomain: number; nodata: number; redirect: number }>({
        queryKey: ["/api/rpz/stats"],
    });

    const entries = pagedData?.entries || [];
    const totalEntries = pagedData?.total || 0;
    const totalPages = pagedData?.totalPages || 1;

    const createMutation = useMutation({
        mutationFn: async (data: InsertRpzEntry) => {
            const res = await apiRequest("POST", "/api/rpz", data);
            try { return await res.json(); } catch { return null; }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
            toast({ title: "Rule added", description: "The DNS firewall rule has been added and applied." });
            setNewEntry({ name: "", type: "nxdomain", target: "", comment: "" });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to add rule", description: error.message, variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/rpz/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
            setDeleteTarget(null);
            toast({ title: "Rule deleted", description: "The DNS firewall rule has been removed." });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to delete rule", description: error.message, variant: "destructive" });
        },
    });

    const clearAllMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("DELETE", "/api/rpz");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
            setClearAllOpen(false);
            toast({ title: "All rules cleared", description: "All DNS firewall rules have been removed." });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to clear rules", description: error.message, variant: "destructive" });
        },
    });

    const syncMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/rpz/sync");
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
            toast({ title: "Sync complete", description: data.message });
        },
        onError: (error: Error) => {
            toast({ title: "Sync failed", description: error.message, variant: "destructive" });
        },
    });

    const importMutation = useMutation({
        mutationFn: async ({ content, sourceName }: { content: string; sourceName: string }) => {
            const res = await apiRequest("POST", "/api/rpz/import", { content, sourceName });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
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
        mutationFn: async ({ url, sourceName }: { url: string; sourceName: string }) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // 3min client timeout
            try {
                const res = await apiRequest("POST", "/api/rpz/import-url", { url, sourceName });
                return res.json();
            } finally {
                clearTimeout(timeoutId);
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            queryClient.invalidateQueries({ queryKey: ["/api/rpz/stats"] });
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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 200 * 1024 * 1024) {
            toast({ title: "File too large", description: "Maximum file size is 200MB", variant: "destructive" });
            return;
        }
        // For large files, use streaming read to avoid loading entire file in RAM
        const CHUNK = 4 * 1024 * 1024; // 4MB chunks
        let result = "";
        let offset = 0;
        const reader = new FileReader();
        reader.onload = (ev) => {
            result += ev.target?.result as string;
            offset += CHUNK;
            if (offset < file.size) {
                const slice = file.slice(offset, offset + CHUNK);
                reader.readAsText(slice);
            } else {
                setImportText(result);
                setImportSourceName(file.name);
                setImportTab("text");
            }
        };
        reader.onerror = () => {
            toast({ title: "File read error", description: "Failed to read the uploaded file", variant: "destructive" });
        };
        const firstSlice = file.slice(0, CHUNK);
        reader.readAsText(firstSlice);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.name) return;
        if (newEntry.type === "redirect" && !newEntry.target) {
            toast({ title: "Target required", description: "Please specify a target IP or domain for redirection.", variant: "destructive" });
            return;
        }
        createMutation.mutate(newEntry as InsertRpzEntry);
    };

    const handleImportText = () => {
        if (!importText.trim()) {
            toast({ title: "No content", description: "Paste or upload blocklist content first", variant: "destructive" });
            return;
        }
        importMutation.mutate({ content: importText, sourceName: importSourceName || "manual-import" });
    };

    const handleImportUrl = () => {
        if (!importUrl.trim()) {
            toast({ title: "No URL", description: "Enter a blocklist URL first", variant: "destructive" });
            return;
        }
        let host = importUrl;
        try { host = new URL(importUrl).hostname; } catch {}
        importUrlMutation.mutate({ url: importUrl, sourceName: importUrlSource || host });
    };

    const handleSearch = useCallback((value: string) => {
        setSearchInput(value);
        setPage(1);
    }, []);

    const handleTypeFilter = useCallback((value: string) => {
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
        return (
            <DashboardLayout>
                <PageState
                    title="Failed to load firewall rules"
                    description={queryError.message || "An unexpected error occurred."}
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
                            {stats?.total || 0} rule{(stats?.total || 0) !== 1 ? "s" : ""}
                        </Badge>
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Upload className="h-4 w-4 mr-2" /> Import
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>Import RPZ Blocklist</DialogTitle>
                                    <DialogDescription>
                                        Import domains from an external RPZ blocklist file, URL, or paste content directly.
                                        Supports RPZ zone file format and plain domain lists.
                                    </DialogDescription>
                                </DialogHeader>
                                <Tabs value={importTab} onValueChange={setImportTab} className="mt-2">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="text">Paste Text</TabsTrigger>
                                        <TabsTrigger value="file">Upload File</TabsTrigger>
                                        <TabsTrigger value="url">From URL</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="text" className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label>Source Name</Label>
                                            <Input
                                                placeholder="e.g. spamhaus-dbl"
                                                value={importSourceName}
                                                onChange={(e) => setImportSourceName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Blocklist Content</Label>
                                            <Textarea
                                                placeholder={"Paste RPZ zone file or domain list here...\n\nExamples:\nexample.com CNAME .\nbad-site.org CNAME .\nmalware.net A 127.0.0.1\n\nOr plain domain list:\nexample.com\nbad-site.org\nmalware.net"}
                                                className="min-h-[200px] font-mono text-sm"
                                                value={importText}
                                                onChange={(e) => setImportText(e.target.value)}
                                            />
                                            <p className="text-[0.8rem] text-muted-foreground">
                                                Supports RPZ zone file format (CNAME ., CNAME *., A records) and plain domain lists (one per line).
                                                Also handles hosts-file format (0.0.0.0 domain.com).
                                            </p>
                                        </div>
                                        <DialogFooter>
                                            <Button onClick={handleImportText} disabled={importMutation.isPending || !importText.trim()}>
                                                {importMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing...</> : <><Upload className="h-4 w-4 mr-2" /> Import</>}
                                            </Button>
                                        </DialogFooter>
                                    </TabsContent>
                                    <TabsContent value="file" className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label>Upload Blocklist File</Label>
                                            <div className="flex items-center gap-3">
                                                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                                    <FileText className="h-4 w-4 mr-2" /> Choose File
                                                </Button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".txt,.lst,.rpz,.conf,.zone,.hosts"
                                                    className="hidden"
                                                    onChange={handleFileUpload}
                                                />
                                                <span className="text-sm text-muted-foreground">Max 200MB</span>
                                            </div>
                                            {importText && (
                                                <div className="mt-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-sm font-medium">File loaded: {importSourceName}</span>
                                                        <Button variant="ghost" size="sm" onClick={() => { setImportText(""); setImportSourceName(""); }}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <Textarea
                                                        className="min-h-[150px] font-mono text-xs"
                                                        value={importText.slice(0, 5000) + (importText.length > 5000 ? "\n... (truncated preview)" : "")}
                                                        readOnly
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <DialogFooter>
                                            <Button onClick={handleImportText} disabled={importMutation.isPending || !importText.trim()}>
                                                {importMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing...</> : <><Upload className="h-4 w-4 mr-2" /> Import File</>}
                                            </Button>
                                        </DialogFooter>
                                    </TabsContent>
                                    <TabsContent value="url" className="space-y-4 mt-4">
                                        <div className="space-y-2">
                                            <Label>Source Name (Optional)</Label>
                                            <Input
                                                placeholder="e.g. hagezi-threat"
                                                value={importUrlSource}
                                                onChange={(e) => setImportUrlSource(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Blocklist URL</Label>
                                            <Input
                                                placeholder="https://example.com/blocklist.rpz"
                                                value={importUrl}
                                                onChange={(e) => setImportUrl(e.target.value)}
                                            />
                                            <p className="text-[0.8rem] text-muted-foreground">
                                                The server will fetch the blocklist from this URL. Only http/https URLs are allowed.
                                                Private/internal URLs are blocked for security.
                                            </p>
                                        </div>
                                        <DialogFooter>
                                            <Button onClick={handleImportUrl} disabled={importUrlMutation.isPending || !importUrl.trim()}>
                                                {importUrlMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Fetching...</> : <><Link className="h-4 w-4 mr-2" /> Fetch & Import</>}
                                            </Button>
                                        </DialogFooter>
                                    </TabsContent>
                                </Tabs>
                            </DialogContent>
                            </Dialog>
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

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
                            <Shield className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.total || 0}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Blocked (NXDOMAIN)</CardTitle>
                            <Globe className="h-4 w-4 text-destructive" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.nxdomain || 0}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">No Data (NODATA)</CardTitle>
                            <Globe className="h-4 w-4 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.nodata || 0}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Redirected</CardTitle>
                            <Globe className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.redirect || 0}</div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-12">
                    {/* Add Rule Card */}
                    <Card className="md:col-span-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Plus className="h-5 w-5" /> Add New Rule
                            </CardTitle>
                            <CardDescription>Block or redirect a domain</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="domain">Domain Name</Label>
                                    <Input
                                        id="domain"
                                        placeholder="malicious-site.com"
                                        value={newEntry.name}
                                        onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
                                        required
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">Wildcards like *.example.com are supported automatically.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="type">Action</Label>
                                    <Select
                                        value={newEntry.type}
                                        onValueChange={(value) => setNewEntry({ ...newEntry, type: value as any })}
                                    >
                                        <SelectTrigger id="type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="nxdomain">Block (NXDOMAIN)</SelectItem>
                                            <SelectItem value="nodata">Block (NODATA)</SelectItem>
                                            <SelectItem value="redirect">Redirect</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {newEntry.type === "redirect" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="target">Redirect Target</Label>
                                        <Input
                                            id="target"
                                            placeholder="127.0.0.1 or blockpage.local"
                                            value={newEntry.target || ""}
                                            onChange={(e) => setNewEntry({ ...newEntry, target: e.target.value })}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="comment">Comment (Optional)</Label>
                                    <Input
                                        id="comment"
                                        placeholder="Reason for blocking..."
                                        value={newEntry.comment || ""}
                                        onChange={(e) => setNewEntry({ ...newEntry, comment: e.target.value })}
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? (
                                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</>
                                    ) : (
                                        <><Plus className="h-4 w-4 mr-2" /> Add Rule</>
                                    )}
                                </Button>
                            </form>

                            <Separator className="my-4" />

                            {/* Quick Actions */}
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Quick Actions</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start"
                                    onClick={() => syncMutation.mutate()}
                                    disabled={syncMutation.isPending}
                                >
                                    {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                    Sync from BIND9 Zone File
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start text-destructive hover:text-destructive"
                                    onClick={() => setClearAllOpen(true)}
                                    disabled={!stats?.total || clearAllMutation.isPending}
                                >
                                    {clearAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                    Clear All Rules
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Active Rules Card */}
                    <Card className="md:col-span-8">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Active Rules</CardTitle>
                                    <CardDescription>
                                        {totalEntries} total rules â€¢ Page {page} of {totalPages}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select value={typeFilter} onValueChange={handleTypeFilter}>
                                        <SelectTrigger className="w-[130px]">
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="nxdomain">NXDOMAIN</SelectItem>
                                            <SelectItem value="nodata">NODATA</SelectItem>
                                            <SelectItem value="redirect">Redirect</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Filter rules..."
                                            className="pl-8 w-[200px]"
                                            value={searchInput}
                                            onChange={(e) => handleSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Domain</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Target</TableHead>
                                            <TableHead>Comment</TableHead>
                                            <TableHead className="w-[100px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!entries.length ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                    {totalEntries ? "No rules match your filter." : "No rules defined. Add a rule or import a blocklist to get started."}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            entries.map((entry) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                                                            <span className="break-all">{entry.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={entry.type === "redirect" ? "secondary" : "destructive"}>
                                                            {entry.type.toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="break-all">{entry.target || "-"}</TableCell>
                                                    <TableCell className="text-muted-foreground max-w-[200px] truncate" title={entry.comment || ""}>
                                                        {entry.comment || "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setDeleteTarget(entry.id)}
                                                            disabled={deleteMutation.isPending}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                    <p className="text-sm text-muted-foreground">
                                        Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, totalEntries)} of {totalEntries}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page <= 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm">{page} / {totalPages}</span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete DNS Firewall Rule</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this rule? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}>
                            Delete Rule
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Clear All Confirmation */}
            <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear All DNS Firewall Rules</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete all {stats?.total || 0} rules? This will remove the entire RPZ blocklist and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => clearAllMutation.mutate()}>
                            Clear All Rules
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}

