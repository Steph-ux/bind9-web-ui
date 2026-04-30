import { Edit, Shield, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AclData } from "@/lib/api";

import { splitAclNetworks } from "./security-utils";

type AclListCardProps = {
    acls: AclData[];
    canManage: boolean;
    onCreate: () => void;
    onEdit: (acl: AclData) => void;
    onDelete: (acl: AclData) => void;
};

export function AclListCard({ acls, canManage, onCreate, onEdit, onDelete }: AclListCardProps) {
    return (
        <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/60">
                <div>
                    <CardTitle className="flex items-center gap-2 text-base tracking-[-0.04em]">
                        <Shield className="h-4 w-4 text-primary" />
                        Access Control Lists
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Imported from and written back to <code className="rounded bg-background/80 px-1">named.conf.acls</code>.
                    </p>
                </div>
                {canManage ? (
                    <Button variant="outline" className="rounded-xl border-border/70 bg-background/70 shadow-none" onClick={onCreate}>
                        Create ACL
                    </Button>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                {acls.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                        No managed ACLs found in <code className="rounded bg-background/80 px-1">named.conf.acls</code>.
                    </div>
                ) : (
                    acls.map((acl) => {
                        const networks = splitAclNetworks(acl.networks);
                        return (
                            <div
                                key={acl.id}
                                className="rounded-2xl border border-border/60 bg-background/45 p-4"
                            >
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="font-mono text-sm font-semibold text-foreground">{acl.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {acl.comment || "No operator note"}
                                        </div>
                                    </div>
                                    {canManage ? (
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(acl)}>
                                                <Edit className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(acl)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {networks.map((network) => (
                                        <Badge key={`${acl.id}-${network}`} variant="secondary" className="font-mono text-[11px]">
                                            {network}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
