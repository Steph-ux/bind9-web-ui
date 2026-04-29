import { Loader2, ShieldCheck } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type { ReplicationServerEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { ReplicationServerFormState } from "./constants";

interface ReplicationServerDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  saving: boolean;
  canSubmit: boolean;
  validationMessage?: string | null;
  form: ReplicationServerFormState;
  setForm: Dispatch<SetStateAction<ReplicationServerFormState>>;
  editTarget?: ReplicationServerEntry | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export function ReplicationServerDialog({
  open,
  title,
  submitLabel,
  saving,
  canSubmit,
  validationMessage,
  form,
  setForm,
  editTarget,
  onOpenChange,
  onSubmit,
}: ReplicationServerDialogProps) {
  const setField = <K extends keyof ReplicationServerFormState>(
    key: K,
    value: ReplicationServerFormState[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const authChanged = !!editTarget && form.authType !== editTarget.authType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {editTarget
            ? "Update the remote replication target. Old credentials are removed automatically when you switch auth mode."
            : "Create a slave or secondary BIND9 node with explicit SSH and path settings."}
        </p>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="ns2.example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 grid gap-2">
              <Label>Host</Label>
              <Input
                value={form.host}
                onChange={(event) => setField("host", event.target.value)}
                placeholder="192.168.1.2"
              />
            </div>
            <div className="grid gap-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(event) => setField("port", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Username</Label>
            <Input
              value={form.username}
              onChange={(event) => setField("username", event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Auth Type</Label>
            <Select
              value={form.authType}
              onValueChange={(value) => setField("authType", value as "password" | "key")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="key">SSH Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.authType === "password" ? (
            <div className="grid gap-2">
              <Label>{editTarget ? "New Password (optional)" : "Password"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setField("password", event.target.value)}
                placeholder="********"
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>{editTarget ? "New Private Key (optional)" : "Private Key"}</Label>
              <Textarea
                className="min-h-[140px] font-mono"
                value={form.privateKey}
                onChange={(event) => setField("privateKey", event.target.value)}
                placeholder={
                  editTarget
                    ? "Leave blank to keep the current private key"
                    : "Paste the private key content"
                }
              />
            </div>
          )}

          {editTarget ? (
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>Leave the credential field blank if you want to keep the stored secret.</p>
              {authChanged ? (
                <p className="mt-2 flex items-start gap-2 text-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  Switching auth mode removes the previous credential type.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>BIND9 Conf Dir</Label>
              <Input
                value={form.bind9ConfDir}
                onChange={(event) => setField("bind9ConfDir", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>BIND9 Zone Dir</Label>
              <Input
                value={form.bind9ZoneDir}
                onChange={(event) => setField("bind9ZoneDir", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setField("role", value as "slave" | "secondary")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slave">Slave</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className={`text-xs ${validationMessage ? "text-destructive" : "text-muted-foreground"}`}>
          {validationMessage || "SSH path overrides are optional. Keep the defaults unless discovery fails on the remote node."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={saving || !canSubmit}
            onClick={onSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
