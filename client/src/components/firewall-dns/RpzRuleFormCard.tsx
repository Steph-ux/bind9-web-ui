import type { FormEvent } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { RpzEntryDraft, RpzEntryType } from "./types";

type RpzRuleFormCardProps = {
    className?: string;
    entry: RpzEntryDraft;
    onEntryChange: (entry: RpzEntryDraft) => void;
    onSubmit: (event: FormEvent) => void;
    createPending: boolean;
    syncPending: boolean;
    clearPending: boolean;
    totalRules: number;
    onSync: () => void;
    onClearAll: () => void;
};

export function RpzRuleFormCard({
    className,
    entry,
    onEntryChange,
    onSubmit,
    createPending,
    syncPending,
    clearPending,
    totalRules,
    onSync,
    onClearAll,
}: RpzRuleFormCardProps) {
    const { t } = useI18n();

    const updateField = <K extends keyof RpzEntryDraft>(field: K, value: RpzEntryDraft[K]) => {
        onEntryChange({ ...entry, [field]: value });
    };

    return (
        <Card className={cn("border-border/60 bg-card/75 shadow-none h-fit", className)}>
            <CardHeader className="pb-3 pt-3.5 px-4 border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-sm font-bold tracking-tight">
                    <Plus className="h-4 w-4 text-primary" />
                    {t.rpz.addNewRule}
                </CardTitle>
                <CardDescription className="text-xs">{t.rpz.blockOrRedirect}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
                <form onSubmit={onSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="domain" className="text-xs font-medium">{t.rpz.domainName}</Label>
                        <Input
                            id="domain"
                            className="h-8.5 text-xs font-mono"
                            placeholder="malicious-site.com"
                            value={entry.name}
                            onChange={(event) => updateField("name", event.target.value)}
                            required
                        />
                        <p className="text-[11px] text-muted-foreground leading-normal">
                            {t.rpz.wildcardsSupported}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="type" className="text-xs font-medium">{t.rpz.action}</Label>
                        <Select
                            value={entry.type}
                            onValueChange={(value) => updateField("type", value as RpzEntryType)}
                        >
                            <SelectTrigger id="type" className="h-8.5 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="nxdomain" className="text-xs">{t.rpz.blockNxdomain}</SelectItem>
                                <SelectItem value="nodata" className="text-xs">{t.rpz.blockNodata}</SelectItem>
                                <SelectItem value="redirect" className="text-xs">{t.rpz.redirect}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {entry.type === "redirect" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="target" className="text-xs font-medium">{t.rpz.redirectTarget}</Label>
                            <Input
                                id="target"
                                className="h-8.5 text-xs font-mono"
                                placeholder="127.0.0.1 or blockpage.local"
                                value={entry.target}
                                onChange={(event) => updateField("target", event.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="comment" className="text-xs font-medium">{t.rpz.commentOptional}</Label>
                        <Input
                            id="comment"
                            className="h-8.5 text-xs"
                            placeholder={t.rpz.reasonPlaceholder}
                            value={entry.comment}
                            onChange={(event) => updateField("comment", event.target.value)}
                        />
                    </div>

                    <Button type="submit" className="w-full h-8.5 text-xs gap-1.5 rounded-lg" disabled={createPending}>
                        {createPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Plus className="h-3.5 w-3.5" />
                        )}
                        {t.rpz.addRuleBtn}
                    </Button>
                </form>

                <Separator className="my-2 opacity-50" />

                <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t.rpz.quickActions}
                    </p>
                    <div className="flex flex-col gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs justify-start gap-2 border-border/60"
                            onClick={onSync}
                            disabled={syncPending}
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", syncPending && "animate-spin")} />
                            {t.rpz.syncFromBind}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs justify-start gap-2 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                            onClick={onClearAll}
                            disabled={clearPending || totalRules === 0}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t.rpz.clearAllRules}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
