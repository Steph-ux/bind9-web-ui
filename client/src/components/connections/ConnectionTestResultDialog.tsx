import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TestConnectionResult } from "@/lib/api";

type ConnectionTestResultDialogProps = {
    result: TestConnectionResult | null;
    onOpenChange: (open: boolean) => void;
};

export function ConnectionTestResultDialog({ result, onOpenChange }: ConnectionTestResultDialogProps) {
    return (
        <Dialog open={Boolean(result)} onOpenChange={onOpenChange}>
            <DialogContent className={result?.success ? "border-green-500" : "border-red-500"}>
                <DialogHeader>
                    <DialogTitle className={result?.success ? "text-green-600" : "text-red-600"}>
                        {result?.success ? "Connection Successful" : "Connection Failed"}
                    </DialogTitle>
                </DialogHeader>

                <p className="mb-3">{result?.message}</p>

                {result?.serverInfo && (
                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                        {[
                            ["Hostname", result.serverInfo.hostname],
                            ["OS", result.serverInfo.os],
                            ["BIND Version", result.serverInfo.bind9Version],
                            ["Service Status", result.serverInfo.bind9Running ? "Running" : "Stopped"],
                        ].map(([label, value]) => (
                            <div key={label} className="mb-1 flex justify-between gap-3">
                                <span className="text-muted-foreground">{label}:</span>
                                <code className="text-right">{String(value)}</code>
                            </div>
                        ))}
                        <div className="my-2 border-t" />
                        <div className="mb-1 text-xs text-muted-foreground">Config Dir:</div>
                        <code className="mb-2 block break-all text-xs">{result.serverInfo.confDir}</code>
                        <div className="mb-1 text-xs text-muted-foreground">Zone Dir:</div>
                        <code className="block break-all text-xs">{result.serverInfo.zoneDir}</code>
                    </div>
                )}

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
