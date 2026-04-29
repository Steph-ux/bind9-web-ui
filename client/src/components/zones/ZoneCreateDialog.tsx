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

interface ZoneCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  domain: string;
  zoneType: string;
  adminEmail: string;
  masterServers: string;
  forwarders: string;
  autoReverse: boolean;
  network: string;
  onDomainChange: (value: string) => void;
  onZoneTypeChange: (value: string) => void;
  onAdminEmailChange: (value: string) => void;
  onMasterServersChange: (value: string) => void;
  onForwardersChange: (value: string) => void;
  onAutoReverseChange: (value: boolean) => void;
  onNetworkChange: (value: string) => void;
  onSubmit: () => void;
}

export function ZoneCreateDialog({
  open,
  onOpenChange,
  creating,
  domain,
  zoneType,
  adminEmail,
  masterServers,
  forwarders,
  autoReverse,
  network,
  onDomainChange,
  onZoneTypeChange,
  onAdminEmailChange,
  onMasterServersChange,
  onForwardersChange,
  onAutoReverseChange,
  onNetworkChange,
  onSubmit,
}: ZoneCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Zone</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="domain">Domain Name</Label>
            <Input
              id="domain"
              placeholder="example.com"
              value={domain}
              onChange={(event) => onDomainChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Zone Type</Label>
            <Select value={zoneType} onValueChange={onZoneTypeChange}>
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
              value={adminEmail}
              onChange={(event) => onAdminEmailChange(event.target.value)}
            />
          </div>
          {zoneType === "slave" && (
            <div className="grid gap-2">
              <Label htmlFor="masters">Master Servers</Label>
              <Input
                id="masters"
                placeholder="192.168.1.10, 192.168.1.11"
                value={masterServers}
                onChange={(event) => onMasterServersChange(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated IP addresses used in the BIND `masters` clause.
              </p>
            </div>
          )}
          {zoneType === "forward" && (
            <div className="grid gap-2">
              <Label htmlFor="forwarders">Forwarders</Label>
              <Input
                id="forwarders"
                placeholder="1.1.1.1, 8.8.8.8"
                value={forwarders}
                onChange={(event) => onForwardersChange(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated IP addresses used in the BIND `forwarders` clause.
              </p>
            </div>
          )}
          {zoneType === "master" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoReverse"
                checked={autoReverse}
                onCheckedChange={(value) => onAutoReverseChange(!!value)}
              />
              <Label htmlFor="autoReverse">Auto-create reverse zone</Label>
            </div>
          )}
          {zoneType === "master" && autoReverse && (
            <div className="grid gap-2">
              <Label htmlFor="network">Network (CIDR)</Label>
              <Input
                id="network"
                placeholder="192.168.1.0/24"
                value={network}
                onChange={(event) => onNetworkChange(event.target.value)}
              />
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
