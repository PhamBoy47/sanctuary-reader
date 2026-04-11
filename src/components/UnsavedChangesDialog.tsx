import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({
  isOpen,
  onClose,
  onSave,
  onDiscard,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-[400px] glass-surface border-border/50">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-foreground">Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground p-2 bg-muted/20 rounded-lg border border-border/30 mt-2">
            You have unsaved changes in your document. Would you like to save them before leaving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} className="sm:mr-auto h-9 text-xs">
            Cancel
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={onDiscard} className="h-9 text-xs">
              Discard
            </Button>
            <Button onClick={onSave} className="h-9 text-xs bg-primary hover:bg-primary/90">
              Save & Exit
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
