import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const CREATE_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV"];
const EDIT_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "PTR"];

interface RecordFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  zoneDomain: string;
  submitting: boolean;
  name: string;
  type: string;
  value: string;
  ttl: string;
  priority: string;
  onOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onTtlChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onSubmit: () => void;
}

export function RecordFormDialog({
  open,
  mode,
  zoneDomain,
  submitting,
  name,
  type,
  value,
  ttl,
  priority,
  onOpenChange,
  onNameChange,
  onTypeChange,
  onValueChange,
  onTtlChange,
  onPriorityChange,
  onSubmit,
}: RecordFormDialogProps) {
  const recordTypes = mode === "create" ? CREATE_RECORD_TYPES : EDIT_RECORD_TYPES;
  const title = mode === "create" ? "Add DNS Record" : "Edit DNS Record";
  const description =
    mode === "create"
      ? `Add a new record to ${zoneDomain}`
      : `Modify record in ${zoneDomain}`;
  const actionLabel = mode === "create" ? "Create Record" : "Save Changes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-name`} className="text-right">
              Name
            </Label>
            <Input
              id={`${mode}-name`}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="col-span-3"
              placeholder="@ or subdomain"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-type`} className="text-right">
              Type
            </Label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger id={`${mode}-type`} className="col-span-3">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {recordTypes.map((recordType) => (
                  <SelectItem key={recordType} value={recordType}>
                    {recordType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-value`} className="text-right">
              Value
            </Label>
            <Input
              id={`${mode}-value`}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              className="col-span-3"
              placeholder="IP or domain"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-ttl`} className="text-right">
              TTL
            </Label>
            <Input
              id={`${mode}-ttl`}
              value={ttl}
              onChange={(event) => onTtlChange(event.target.value)}
              className="col-span-3"
            />
          </div>
          {type === "MX" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor={`${mode}-priority`} className="text-right">
                Priority
              </Label>
              <Input
                id={`${mode}-priority`}
                value={priority}
                onChange={(event) => onPriorityChange(event.target.value)}
                className="col-span-3"
                placeholder="10"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
