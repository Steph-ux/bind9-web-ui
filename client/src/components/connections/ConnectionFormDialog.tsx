import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ConnectionData } from "@/lib/api";
import type { ConnectionFormValues } from "@/lib/client-schemas";

type ConnectionFormDialogProps = {
    open: boolean;
    editingConnection: ConnectionData | null;
    values: ConnectionFormValues;
    validationMessage: string | null;
    authChanged: boolean;
    canTestDraft: boolean;
    canSave: boolean;
    saving: boolean;
    testingDraft: boolean;
    onOpenChange: (open: boolean) => void;
    onFieldChange: <K extends keyof ConnectionFormValues>(field: K, value: ConnectionFormValues[K]) => void;
    onSave: () => void;
    onTestDraft: () => void;
};

export function ConnectionFormDialog({
    open,
    editingConnection,
    values,
    validationMessage,
    authChanged,
    canTestDraft,
    canSave,
    saving,
    testingDraft,
    onOpenChange,
    onFieldChange,
    onSave,
    onTestDraft,
}: ConnectionFormDialogProps) {
    const requiresInlineSecret = values.authType === "password" ? !values.password.trim() : !values.privateKey.trim();
    const testHint = editingConnection && !authChanged && requiresInlineSecret
        ? "Use the card-level test if you want to validate the stored secret without replacing it."
        : "Testing from this dialog uses only the credentials currently entered in the form.";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
                <DialogHeader>
                    <DialogTitle>{editingConnection ? "Edit SSH Connection" : "New SSH Connection"}</DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    {editingConnection
                        ? "Update the remote BIND9 target. Unused secrets are removed automatically."
                        : "Create a remote BIND9 target with explicit SSH and path settings."}
                </p>

                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-4">
                    {[
                        { field: "name", label: "Name", placeholder: "e.g. Production DNS", mono: false },
                        { field: "host", label: "Host", placeholder: "IP or hostname", mono: true },
                        { field: "port", label: "Port", placeholder: "22", mono: true },
                        { field: "username", label: "User", placeholder: "root", mono: true },
                    ].map(({ field, label, placeholder, mono }) => (
                        <div key={field} className="grid gap-2">
                            <Label htmlFor={`connection-${field}`}>{label}</Label>
                            <Input
                                id={`connection-${field}`}
                                className={mono ? "font-mono" : ""}
                                value={values[field as keyof ConnectionFormValues] as string}
                                onChange={(event) => onFieldChange(field as keyof ConnectionFormValues, event.target.value)}
                                placeholder={placeholder}
                            />
                        </div>
                    ))}

                    <div className="grid gap-2">
                        <Label>Authentication</Label>
                        <Select
                            value={values.authType}
                            onValueChange={(value: "password" | "key") => onFieldChange("authType", value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select authentication" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="password">Password</SelectItem>
                                <SelectItem value="key">Private key</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {values.authType === "password" ? (
                        <div className="grid gap-2">
                            <Label htmlFor="connection-password">Password</Label>
                            <Input
                                id="connection-password"
                                type="password"
                                className="font-mono"
                                value={values.password}
                                onChange={(event) => onFieldChange("password", event.target.value)}
                                placeholder={editingConnection ? "Leave blank to keep current password" : "SSH password"}
                            />
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            <Label htmlFor="connection-private-key">Private Key</Label>
                            <Textarea
                                id="connection-private-key"
                                className="min-h-[140px] font-mono"
                                value={values.privateKey}
                                onChange={(event) => onFieldChange("privateKey", event.target.value)}
                                placeholder={editingConnection ? "Leave blank to keep current private key" : "Paste the private key content"}
                            />
                        </div>
                    )}

                    {editingConnection && (
                        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
                            <p>Leave the current credential field blank if you do not want to replace that secret.</p>
                            {authChanged && (
                                <p className="mt-2 flex items-start gap-2 text-foreground">
                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    Switching auth mode removes the previously stored credential type.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="border-t pt-4">
                        <p className="mb-3 text-center text-xs text-muted-foreground">
                            Optional: override default paths if auto-detection fails
                        </p>
                        <div className="grid gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="connection-conf-dir" className="text-sm">Config Dir</Label>
                                <Input
                                    id="connection-conf-dir"
                                    className="h-8 font-mono text-sm"
                                    value={values.bind9ConfDir}
                                    onChange={(event) => onFieldChange("bind9ConfDir", event.target.value)}
                                    placeholder="/etc/bind"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="connection-zone-dir" className="text-sm">Zone Dir</Label>
                                <Input
                                    id="connection-zone-dir"
                                    className="h-8 font-mono text-sm"
                                    value={values.bind9ZoneDir}
                                    onChange={(event) => onFieldChange("bind9ZoneDir", event.target.value)}
                                    placeholder="/var/cache/bind"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="connection-rndc-bin" className="text-sm">RNDC Binary</Label>
                                <Input
                                    id="connection-rndc-bin"
                                    className="h-8 font-mono text-sm"
                                    value={values.rndcBin}
                                    onChange={(event) => onFieldChange("rndcBin", event.target.value)}
                                    placeholder="/usr/sbin/rndc"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className={`text-xs ${validationMessage ? "text-destructive" : "text-muted-foreground"}`}>
                        {validationMessage || testHint}
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={onTestDraft} disabled={!canTestDraft || testingDraft || saving}>
                        {testingDraft && <Loader2 className="h-4 w-4 animate-spin" />}
                        Test Draft
                    </Button>
                    <Button className="gap-2" onClick={onSave} disabled={!canSave || saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {editingConnection ? "Save Changes" : "Create Connection"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
