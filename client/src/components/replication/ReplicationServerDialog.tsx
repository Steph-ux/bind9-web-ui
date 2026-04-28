import { Loader2 } from "lucide-react";
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

import type { ReplicationServerFormState } from "./constants";

interface ReplicationServerDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  saving: boolean;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-2">
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
              <Input
                type="password"
                value={form.privateKey}
                onChange={(event) => setField("privateKey", event.target.value)}
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
              />
            </div>
          )}

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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={saving || !form.name || !form.host}
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
