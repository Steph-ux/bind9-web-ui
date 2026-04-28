import { Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

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

import type {
  NotificationChannelFormState,
  ReplicationBindingDraft,
} from "./constants";

interface ReplicationZoneBindingsDialogProps {
  open: boolean;
  serverName?: string;
  loading: boolean;
  bindings: ReplicationBindingDraft[];
  setBindings: Dispatch<SetStateAction<ReplicationBindingDraft[]>>;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function ReplicationZoneBindingsDialog({
  open,
  serverName,
  loading,
  bindings,
  setBindings,
  onOpenChange,
  onSave,
}: ReplicationZoneBindingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Zones - {serverName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : bindings.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No master zones available.</p>
        ) : (
          <div className="space-y-3">
            {bindings.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={binding.enabled}
                    onChange={(event) =>
                      setBindings((current) =>
                        current.map((entry) =>
                          entry.id === binding.id ? { ...entry, enabled: event.target.checked } : entry
                        )
                      )
                    }
                    className="h-4 w-4"
                  />
                  <span className="truncate font-mono text-sm">{binding.domain}</span>
                </div>
                <Select
                  value={binding.mode}
                  onValueChange={(value) =>
                    setBindings((current) =>
                      current.map((entry) =>
                        entry.id === binding.id
                          ? { ...entry, mode: value as "push" | "pull" | "both" }
                          : entry
                      )
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="pull">Pull</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NotificationChannelDialogProps {
  open: boolean;
  form: NotificationChannelFormState;
  setForm: Dispatch<SetStateAction<NotificationChannelFormState>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export function NotificationChannelDialog({
  open,
  form,
  setForm,
  onOpenChange,
  onSubmit,
}: NotificationChannelDialogProps) {
  const setField = <K extends keyof NotificationChannelFormState>(
    key: K,
    value: NotificationChannelFormState[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Ops Slack"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(value) => setField("type", value as "email" | "webhook" | "slack")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.type === "webhook" ? (
            <div className="grid gap-2">
              <Label>Webhook URL</Label>
              <Input
                value={form.url}
                onChange={(event) => setField("url", event.target.value)}
                placeholder="https://hooks.example.com/..."
              />
            </div>
          ) : null}

          {form.type === "slack" ? (
            <div className="grid gap-2">
              <Label>Slack Webhook URL</Label>
              <Input
                value={form.url}
                onChange={(event) => setField("url", event.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
          ) : null}

          {form.type === "email" ? (
            <div className="grid gap-2">
              <Label>Email Address</Label>
              <Input
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="admin@example.com"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
