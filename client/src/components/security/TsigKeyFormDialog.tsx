import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TsigKeyFormDialogProps = {
    open: boolean;
    saving: boolean;
    values: {
        name: string;
        algorithm: "hmac-sha256" | "hmac-sha512" | "hmac-md5";
        secret: string;
    };
    errors: Partial<Record<"name" | "algorithm" | "secret", string>>;
    onOpenChange: (open: boolean) => void;
    onNameChange: (value: string) => void;
    onAlgorithmChange: (value: "hmac-sha256" | "hmac-sha512" | "hmac-md5") => void;
    onSecretChange: (value: string) => void;
    onSubmit: () => void;
};

export function TsigKeyFormDialog({
    open,
    saving,
    values,
    errors,
    onOpenChange,
    onNameChange,
    onAlgorithmChange,
    onSecretChange,
    onSubmit,
}: TsigKeyFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create TSIG Key</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Create a shared secret in <code className="rounded bg-muted px-1">named.conf.keys</code>. Existing secrets are never returned in full by the API.
                </p>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="keyName">Name</Label>
                        <Input
                            id="keyName"
                            className="font-mono"
                            value={values.name}
                            onChange={(event) => onNameChange(event.target.value)}
                            placeholder="transfer-key"
                        />
                        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="keyAlgorithm">Algorithm</Label>
                        <Select
                            value={values.algorithm}
                            onValueChange={(value) =>
                                onAlgorithmChange(value as "hmac-sha256" | "hmac-sha512" | "hmac-md5")
                            }
                        >
                            <SelectTrigger id="keyAlgorithm">
                                <SelectValue placeholder="Select an algorithm" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hmac-sha256">HMAC-SHA256</SelectItem>
                                <SelectItem value="hmac-sha512">HMAC-SHA512</SelectItem>
                                <SelectItem value="hmac-md5">HMAC-MD5</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.algorithm ? <p className="text-xs text-destructive">{errors.algorithm}</p> : null}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="keySecret">Secret</Label>
                        <Input
                            id="keySecret"
                            type="password"
                            className="font-mono"
                            value={values.secret}
                            onChange={(event) => onSecretChange(event.target.value)}
                            placeholder="Base64 encoded secret"
                        />
                        {errors.secret ? <p className="text-xs text-destructive">{errors.secret}</p> : null}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={onSubmit} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
