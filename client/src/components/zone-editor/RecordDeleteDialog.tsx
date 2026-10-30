import type { RecordData } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();

  return (
    <AlertDialog
      open={!!record}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.zones.deleteRecordTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.zones.deleteRecordDesc} <strong>{record?.name}</strong>{" "}
            ({record?.type}) ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {t.zones.deleteRecordBtn}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
