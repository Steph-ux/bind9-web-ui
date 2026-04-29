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
    const updateField = <K extends keyof RpzEntryDraft>(field: K, value: RpzEntryDraft[K]) => {
        onEntryChange({ ...entry, [field]: value });
    };

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Add New Rule
                </CardTitle>
                <CardDescription>Block or redirect a domain</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="domain">Domain Name</Label>
                        <Input
                            id="domain"
                            placeholder="malicious-site.com"
                            value={entry.name}
                            onChange={(event) => updateField("name", event.target.value)}
                            required
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Wildcards like *.example.com are supported automatically.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="type">Action</Label>
                        <Select
                            value={entry.type}
                            onValueChange={(value) => updateField("type", value as RpzEntryType)}
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

                    {entry.type === "redirect" && (
                        <div className="space-y-2">
                            <Label htmlFor="target">Redirect Target</Label>
                            <Input
                                id="target"
                                placeholder="127.0.0.1 or blockpage.local"
                                value={entry.target}
                                onChange={(event) => updateField("target", event.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="comment">Comment (Optional)</Label>
                        <Input
                            id="comment"
                            placeholder="Reason for blocking..."
                            value={entry.comment}
                            onChange={(event) => updateField("comment", event.target.value)}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={createPending}>
                        {createPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Rule
                            </>
                        )}
                    </Button>
                </form>

                <Separator className="my-4" />

                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Quick Actions</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={onSync}
                        disabled={syncPending}
                    >
                        {syncPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Sync from BIND9 Zone File
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={onClearAll}
                        disabled={!totalRules || clearPending}
                    >
                        {clearPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Clear All Rules
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
