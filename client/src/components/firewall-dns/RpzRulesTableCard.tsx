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
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
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
    const { t, language } = useI18n();

    const renderActionBadge = (type: string) => {
        switch (type) {
            case "nxdomain":
                return <Badge variant="destructive" className="text-[10px] uppercase font-mono">{t.rpz.blockNxdomain}</Badge>;
            case "nodata":
                return <Badge variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] uppercase font-mono">{t.rpz.blockNodata}</Badge>;
            case "redirect":
                return <Badge variant="default" className="text-[10px] uppercase font-mono">{t.rpz.redirect}</Badge>;
            default:
                return <Badge variant="outline" className="text-[10px] uppercase font-mono">{type}</Badge>;
        }
    };

    return (
        <Card className={cn("border-border/60 bg-card/75 shadow-none", className)}>
            <CardHeader className="pb-3 pt-3.5 px-4 border-b border-border/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="text-sm font-bold tracking-tight">{t.rpz.activeRules}</CardTitle>
                        <CardDescription className="text-xs">
                            {totalEntries} {language === "fr" ? "règles" : "rules"} • Page {page} {language === "fr" ? "sur" : "of"} {totalPages || 1}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as RpzTypeFilter)}>
                            <SelectTrigger className="w-[125px] h-8 text-xs">
                                <SelectValue placeholder={t.rpz.allTypes} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">{t.rpz.allTypes}</SelectItem>
                                <SelectItem value="nxdomain" className="text-xs">NXDOMAIN</SelectItem>
                                <SelectItem value="nodata" className="text-xs">NODATA</SelectItem>
                                <SelectItem value="redirect" className="text-xs">Redirect</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder={t.rpz.searchPlaceholder}
                                className="pl-8 h-8 text-xs w-[160px] sm:w-[200px]"
                                value={searchInput}
                                onChange={(event) => onSearchChange(event.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border/50 hover:bg-transparent">
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-8.5 px-4">{t.rpz.domainCol}</TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-8.5 px-4">{t.rpz.typeCol}</TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-8.5 px-4">{t.rpz.targetCol}</TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-8.5 px-4">{t.rpz.commentCol}</TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider h-8.5 px-4 text-right">{t.rpz.actionsCol}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-1.5">
                                        <Globe className="h-6 w-6 text-muted-foreground/40" />
                                        <p className="text-xs font-medium">{t.rpz.noRules}</p>
                                        <p className="text-[11px] text-muted-foreground/75">
                                            {t.rpz.noRulesDesc}
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            entries.map((rule) => (
                                <TableRow key={rule.id} className="border-border/40 hover:bg-muted/30">
                                    <TableCell className="font-mono text-xs font-semibold px-4 py-2.5">
                                        {rule.name}
                                    </TableCell>
                                    <TableCell className="px-4 py-2.5">{renderActionBadge(rule.type)}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground px-4 py-2.5">
                                        {rule.target || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate px-4 py-2.5">
                                        {rule.comment || "—"}
                                    </TableCell>
                                    <TableCell className="text-right px-4 py-2.5">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            disabled={deletePending}
                                            onClick={() => onDeleteRequest(rule.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 text-xs">
                        <span className="text-[11px] text-muted-foreground">
                            Page {page} {language === "fr" ? "sur" : "of"} {totalPages}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 gap-1"
                                onClick={onPreviousPage}
                                disabled={page <= 1}
                            >
                                <ChevronLeft className="h-3 w-3" />
                                {t.rpz.previous}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 gap-1"
                                onClick={onNextPage}
                                disabled={page >= totalPages}
                            >
                                {t.rpz.next}
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
