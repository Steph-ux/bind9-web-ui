import { ChevronLeft, ChevronRight, Globe, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { RpzEntry, RpzTypeFilter } from "./types";

type RpzRulesTableCardProps = {
    className?: string;
    entries: RpzEntry[];
    totalEntries: number;
    page: number;
    pageSize: number;
    totalPages: number;
    typeFilter: RpzTypeFilter;
    onTypeFilterChange: (value: RpzTypeFilter) => void;
    searchInput: string;
    onSearchChange: (value: string) => void;
    deletePending: boolean;
    onDeleteRequest: (id: string) => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
};

export function RpzRulesTableCard({
    className,
    entries,
    totalEntries,
    page,
    pageSize,
    totalPages,
    typeFilter,
    onTypeFilterChange,
    searchInput,
    onSearchChange,
    deletePending,
    onDeleteRequest,
    onPreviousPage,
    onNextPage,
}: RpzRulesTableCardProps) {
    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <CardTitle>Active Rules</CardTitle>
                        <CardDescription>
                            {totalEntries} total rules - Page {page} of {totalPages}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as RpzTypeFilter)}>
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
                                className="w-[200px] pl-8"
                                value={searchInput}
                                onChange={(event) => onSearchChange(event.target.value)}
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
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        {totalEntries
                                            ? "No rules match your filter."
                                            : "No rules defined. Add a rule or import a blocklist to get started."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                entries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="break-all">{entry.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={entry.type === "redirect" ? "secondary" : "destructive"}>
                                                {entry.type.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="break-all">{entry.target || "-"}</TableCell>
                                        <TableCell className="max-w-[200px] truncate text-muted-foreground" title={entry.comment || ""}>
                                            {entry.comment || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => onDeleteRequest(entry.id)}
                                                disabled={deletePending}
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
                {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalEntries)} of {totalEntries}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={onPreviousPage} disabled={page <= 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm">
                                {page} / {totalPages}
                            </span>
                            <Button variant="outline" size="sm" onClick={onNextPage} disabled={page >= totalPages}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
