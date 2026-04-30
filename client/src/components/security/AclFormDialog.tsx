import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AclFormDialogProps = {
    open: boolean;
    saving: boolean;
    editing: boolean;
    values: {
        name: string;
        networks: string;
        comment: string;
    };
    errors: Partial<Record<"name" | "networks" | "comment", string>>;
    onOpenChange: (open: boolean) => void;
    onChange: (field: "name" | "networks" | "comment", value: string) => void;
    onSubmit: () => void;
};

export function AclFormDialog({
    open,
    saving,
    editing,
    values,
    errors,
    onOpenChange,
    onChange,
    onSubmit,
}: AclFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit ACL" : "Create ACL"}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Manage ACL entries written to <code className="rounded bg-muted px-1">named.conf.acls</code>.
                </p>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="aclName">Name</Label>
                        <Input
                            id="aclName"
                            className="font-mono"
                            value={values.name}
                            onChange={(event) => onChange("name", event.target.value)}
                            placeholder="trusted-clients"
                        />
                        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="aclNetworks">Networks</Label>
                        <Textarea
                            id="aclNetworks"
                            className="min-h-[120px] font-mono"
                            value={values.networks}
                            onChange={(event) => onChange("networks", event.target.value)}
                            placeholder={"192.168.11.103;\n192.168.11.106;\n192.168.8.0/22;"}
                            spellCheck={false}
                        />
                        <p className="text-xs text-muted-foreground">
                            One address match per line. End each item with a semicolon if you want the saved output to stay visually aligned with BIND.
                        </p>
                        {errors.networks ? <p className="text-xs text-destructive">{errors.networks}</p> : null}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="aclComment">Comment</Label>
                        <Input
                            id="aclComment"
                            value={values.comment}
                            onChange={(event) => onChange("comment", event.target.value)}
                            placeholder="Optional note for operators"
                        />
                        {errors.comment ? <p className="text-xs text-destructive">{errors.comment}</p> : null}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={onSubmit} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {editing ? "Update ACL" : "Create ACL"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
