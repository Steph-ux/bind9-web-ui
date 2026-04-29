import type { RecordData } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecordDeleteDialogProps {
  record: RecordData | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RecordDeleteDialog({
  record,
  onOpenChange,
  onConfirm,
}: RecordDeleteDialogProps) {
  return (
    <AlertDialog
      open={!!record}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete DNS Record</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete record <strong>{record?.name}</strong>{" "}
            ({record?.type})? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete Record
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
