import { Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";

import type {
  NotificationChannelFormState,
  ReplicationBindingDraft,
} from "./constants";
import { NOTIFICATION_EVENT_OPTIONS } from "./constants";

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
  title: string;
  submitLabel: string;
  saving?: boolean;
  canSubmit: boolean;
  validationMessage?: string | null;
  editing?: boolean;
  form: NotificationChannelFormState;
  setForm: Dispatch<SetStateAction<NotificationChannelFormState>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export function NotificationChannelDialog({
  open,
  title,
  submitLabel,
  saving = false,
  canSubmit,
  validationMessage,
  editing = false,
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
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {editing
            ? "Update the destination, delivery events and enabled state. Existing destination details stay unchanged if you leave that field blank."
            : "Create a delivery channel for health, conflict and outage events."}
        </p>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-4">
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

          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <div>
              <Label className="text-sm">Enabled</Label>
              <p className="text-xs text-muted-foreground">Disabled channels stay stored but receive no alerts.</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setField("enabled", checked)}
            />
          </div>

          {form.type === "webhook" ? (
            <div className="grid gap-2">
              <Label>Webhook URL</Label>
              <Input
                value={form.url}
                onChange={(event) => setField("url", event.target.value)}
                placeholder={
                  editing
                    ? "Leave blank to keep the current webhook URL"
                    : "https://hooks.example.com/..."
                }
              />
            </div>
          ) : null}

          {form.type === "slack" ? (
            <div className="grid gap-2">
              <Label>Slack Webhook URL</Label>
              <Input
                value={form.url}
                onChange={(event) => setField("url", event.target.value)}
                placeholder={
                  editing
                    ? "Leave blank to keep the current Slack webhook"
                    : "https://hooks.slack.com/services/..."
                }
              />
            </div>
          ) : null}

          {form.type === "email" ? (
            <div className="grid gap-2">
              <Label>Email Address</Label>
              <Input
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder={editing ? "Leave blank to keep the current email target" : "admin@example.com"}
              />
            </div>
          ) : null}

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Events</Label>
              <p className="text-xs text-muted-foreground">Select which replication incidents should trigger this channel.</p>
            </div>
            <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              {NOTIFICATION_EVENT_OPTIONS.map((option) => {
                const checked = form.events.includes(option.value);
                return (
                  <label key={option.value} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setForm((current) => ({
                          ...current,
                          events: next
                            ? [...current.events, option.value]
                            : current.events.filter((event) => event !== option.value),
                        }))
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <p className={`text-xs ${validationMessage ? "text-destructive" : "text-muted-foreground"}`}>
          {validationMessage || "Webhook and Slack targets must use a public http/https endpoint."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving || !canSubmit}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
