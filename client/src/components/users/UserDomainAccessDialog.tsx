import { Globe, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ManagedUser } from "@/lib/api";

import type { ZoneAccessOption } from "./user-types";

export function UserDomainAccessDialog({
  user,
  zoneIds,
  allZones,
  isLoading,
  onZoneIdsChange,
  onClose,
  onSave,
}: {
  user: ManagedUser | null;
  zoneIds: string[];
  allZones: ZoneAccessOption[];
  isLoading: boolean;
  onZoneIdsChange: (zoneIds: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Access: {user?.username}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select which zones this viewer can access. Admins and operators always see all zones.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : allZones.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No zones available</p>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto py-2">
            {allZones.map((zone) => (
              <label
                key={zone.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  checked={zoneIds.includes(zone.id)}
                  onCheckedChange={(checked) => {
                    onZoneIdsChange(
                      checked
                        ? [...zoneIds, zone.id]
                        : zoneIds.filter((currentZoneId) => currentZoneId !== zone.id),
                    );
                  }}
                />
                <span className="text-sm">{zone.domain}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-2" disabled={isLoading} onClick={onSave}>
            Save Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
