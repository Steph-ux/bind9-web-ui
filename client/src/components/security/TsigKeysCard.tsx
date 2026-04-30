import { KeyRound, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KeyData } from "@/lib/api";

import { isMaskedSecret } from "./security-utils";

type TsigKeysCardProps = {
    keys: KeyData[];
    canManage: boolean;
    onCreate: () => void;
    onDelete: (key: KeyData) => void;
};

export function TsigKeysCard({ keys, canManage, onCreate, onDelete }: TsigKeysCardProps) {
    return (
        <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/60">
                <div>
                    <CardTitle className="flex items-center gap-2 text-base tracking-[-0.04em]">
                        <KeyRound className="h-4 w-4 text-primary" />
                        TSIG Keys
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Imported from and written back to <code className="rounded bg-background/80 px-1">named.conf.keys</code>.
                    </p>
                </div>
                {canManage ? (
                    <Button variant="outline" className="rounded-xl border-border/70 bg-background/70 shadow-none" onClick={onCreate}>
                        Create Key
                    </Button>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                {keys.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                        No managed TSIG keys found in <code className="rounded bg-background/80 px-1">named.conf.keys</code>.
                    </div>
                ) : (
                    keys.map((key) => (
                        <div key={key.id} className="rounded-2xl border border-border/60 bg-background/45 p-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-semibold text-foreground">{key.name}</span>
                                        <Badge variant="secondary" className="rounded-full text-[10px] uppercase">
                                            {key.algorithm}
                                        </Badge>
                                    </div>
                                    <div className="font-mono text-xs text-muted-foreground">
                                        {isMaskedSecret(key.secret)
                                            ? key.secret
                                            : "Secret stored on server"}
                                    </div>
                                </div>
                                {canManage ? (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(key)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Existing TSIG secrets are intentionally masked by the API and cannot be read back in full from the UI.
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
