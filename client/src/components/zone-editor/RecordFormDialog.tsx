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
import {
  recordFormTypeOptions,
  recordPriorityTypes,
  type RecordFormValues,
} from "@/lib/client-schemas";

interface RecordFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  zoneDomain: string;
  submitting: boolean;
  values: RecordFormValues;
  errors: Partial<Record<keyof RecordFormValues, string>>;
  onOpenChange: (open: boolean) => void;
  onFieldChange: <K extends keyof RecordFormValues>(field: K, value: RecordFormValues[K]) => void;
  onSubmit: () => void;
}

export function RecordFormDialog({
  open,
  mode,
  zoneDomain,
  submitting,
  values,
  errors,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: RecordFormDialogProps) {
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
              value={values.name}
              onChange={(event) => onFieldChange("name", event.target.value)}
              className="col-span-3 font-mono"
              placeholder="@ or subdomain"
            />
            {errors.name ? <p className="col-span-3 col-start-2 text-xs text-destructive">{errors.name}</p> : null}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-type`} className="text-right">
              Type
            </Label>
            <Select
              value={values.type}
              onValueChange={(value) => onFieldChange("type", value as RecordFormValues["type"])}
            >
              <SelectTrigger id={`${mode}-type`} className="col-span-3">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {recordFormTypeOptions.map((recordType) => (
                  <SelectItem key={recordType} value={recordType}>
                    {recordType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type ? <p className="col-span-3 col-start-2 text-xs text-destructive">{errors.type}</p> : null}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-value`} className="text-right">
              Value
            </Label>
            <Input
              id={`${mode}-value`}
              value={values.value}
              onChange={(event) => onFieldChange("value", event.target.value)}
              className="col-span-3 font-mono"
              placeholder="IP or domain"
            />
            {errors.value ? <p className="col-span-3 col-start-2 text-xs text-destructive">{errors.value}</p> : null}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${mode}-ttl`} className="text-right">
              TTL
            </Label>
            <Input
              id={`${mode}-ttl`}
              value={values.ttl}
              onChange={(event) => onFieldChange("ttl", event.target.value)}
              className="col-span-3 font-mono"
            />
            {errors.ttl ? <p className="col-span-3 col-start-2 text-xs text-destructive">{errors.ttl}</p> : null}
          </div>
          {recordPriorityTypes.includes(values.type as (typeof recordPriorityTypes)[number]) && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor={`${mode}-priority`} className="text-right">
                Priority
              </Label>
              <Input
                id={`${mode}-priority`}
                value={values.priority}
                onChange={(event) => onFieldChange("priority", event.target.value)}
                className="col-span-3 font-mono"
                placeholder="10"
              />
              {errors.priority ? <p className="col-span-3 col-start-2 text-xs text-destructive">{errors.priority}</p> : null}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
