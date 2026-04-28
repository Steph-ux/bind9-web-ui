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
import type { ManagedUser } from "@/lib/api";

import type { UserRole } from "./user-types";

export function EditUserDialog({
  user,
  role,
  password,
  mustChangePassword,
  isPending,
  onRoleChange,
  onPasswordChange,
  onMustChangePasswordChange,
  onClose,
  onSave,
}: {
  user: ManagedUser | null;
  role: UserRole;
  password: string;
  mustChangePassword: boolean;
  isPending: boolean;
  onRoleChange: (role: UserRole) => void;
  onPasswordChange: (password: string) => void;
  onMustChangePasswordChange: (checked: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User: {user?.username}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => onRoleChange(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>
              New Password{" "}
              <span className="font-normal text-muted-foreground">(leave blank to keep current)</span>
            </Label>
            <Input
              type="password"
              placeholder="********"
              autoComplete="new-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3">
            <Checkbox
              checked={mustChangePassword}
              onCheckedChange={(checked) => onMustChangePasswordChange(Boolean(checked))}
            />
            <div className="space-y-1">
              <span className="text-sm font-medium">Require password change on next login</span>
              <p className="text-sm text-muted-foreground">
                Keep this enabled when you reset or hand over an account.
              </p>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-2" disabled={isPending} onClick={onSave}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
