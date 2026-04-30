import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ZoneCreateFormValues } from "@/lib/client-schemas";

interface ZoneCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  values: ZoneCreateFormValues;
  errors: Partial<Record<keyof ZoneCreateFormValues, string>>;
  validationMessage: string | null;
  autoReverse: boolean;
  onFieldChange: <K extends keyof ZoneCreateFormValues>(field: K, value: ZoneCreateFormValues[K]) => void;
  onSubmit: () => void;
}

export function ZoneCreateDialog({
  open,
  onOpenChange,
  creating,
  values,
  errors,
  validationMessage,
  autoReverse,
  onFieldChange,
  onSubmit,
}: ZoneCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Zone</DialogTitle>
        </DialogHeader>
        <p className={`text-sm ${validationMessage ? "text-destructive" : "text-muted-foreground"}`}>
          {validationMessage || "Create master, slave or forward zones with the same constraints enforced by the API."}
        </p>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="domain">Domain Name</Label>
            <Input
              id="domain"
              placeholder="example.com"
              className="font-mono"
              value={values.domain}
              onChange={(event) => onFieldChange("domain", event.target.value)}
            />
            {errors.domain ? <p className="text-xs text-destructive">{errors.domain}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Zone Type</Label>
            <Select
              value={values.zoneType}
              onValueChange={(value: "master" | "slave" | "forward") => onFieldChange("zoneType", value)}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="master">Master</SelectItem>
                <SelectItem value="slave">Slave</SelectItem>
                <SelectItem value="forward">Forward</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin">Admin Email</Label>
            <Input
              id="admin"
              placeholder="admin.example.com"
              className="font-mono"
              value={values.adminEmail}
              onChange={(event) => onFieldChange("adminEmail", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Use the BIND host-style format, for example `admin.example.com`.</p>
            {errors.adminEmail ? <p className="text-xs text-destructive">{errors.adminEmail}</p> : null}
          </div>
          {values.zoneType === "slave" && (
            <div className="grid gap-2">
              <Label htmlFor="masters">Master Servers</Label>
              <Input
                id="masters"
                placeholder="192.168.1.10, 192.168.1.11"
                className="font-mono"
                value={values.masterServers}
                onChange={(event) => onFieldChange("masterServers", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated IP addresses used in the BIND `masters` clause.
              </p>
              {errors.masterServers ? <p className="text-xs text-destructive">{errors.masterServers}</p> : null}
            </div>
          )}
          {values.zoneType === "forward" && (
            <div className="grid gap-2">
              <Label htmlFor="forwarders">Forwarders</Label>
              <Input
                id="forwarders"
                placeholder="1.1.1.1, 8.8.8.8"
                className="font-mono"
                value={values.forwarders}
                onChange={(event) => onFieldChange("forwarders", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated IP addresses used in the BIND `forwarders` clause.
              </p>
              {errors.forwarders ? <p className="text-xs text-destructive">{errors.forwarders}</p> : null}
            </div>
          )}
          {values.zoneType === "master" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoReverse"
                checked={autoReverse}
                onCheckedChange={(value) => onFieldChange("autoReverse", !!value)}
              />
              <Label htmlFor="autoReverse">Auto-create reverse zone</Label>
            </div>
          )}
          {values.zoneType === "master" && autoReverse && (
            <div className="grid gap-2">
              <Label htmlFor="network">Network (CIDR)</Label>
              <Input
                id="network"
                placeholder="192.168.1.0/24"
                className="font-mono"
                value={values.network}
                onChange={(event) => onFieldChange("network", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Only IPv4 `/8`, `/16` and `/24` networks are supported for auto-reverse.</p>
              {errors.network ? <p className="text-xs text-destructive">{errors.network}</p> : null}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
