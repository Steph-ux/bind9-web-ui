import { AlertTriangle, Copy, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DnssecKeyEntry, DnssecStatus, ZoneDnssecInfo } from "@/lib/api";

interface ZoneDnssecTabProps {
  zoneDomain: string;
  dnssec: ZoneDnssecInfo | null;
  dnssecStatus: DnssecStatus | null;
  dnssecError: string | null;
  canManageDnssec: boolean;
  readOnlyReason: string | null;
  managedKeys: DnssecKeyEntry[];
  dnssecLoading: boolean;
  onGenerateKey: (keyType: "KSK" | "ZSK") => void;
  onSignZone: () => void;
  onRetireKey: (keyId: string) => void;
  onCopyDsRecord: (value: string) => void;
}

export function ZoneDnssecTab({
  zoneDomain,
  dnssec,
  dnssecStatus,
  dnssecError,
  canManageDnssec,
  readOnlyReason,
  managedKeys,
  dnssecLoading,
  onGenerateKey,
  onSignZone,
  onRetireKey,
  onCopyDsRecord,
}: ZoneDnssecTabProps) {
  const signed = dnssec?.enabled || dnssecStatus?.signed;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {dnssecError ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Partial DNSSEC visibility</AlertTitle>
            <AlertDescription>
              {dnssecError} Key operations may still work, but this tab does not currently have the full state.
            </AlertDescription>
          </Alert>
        ) : null}

        {!canManageDnssec && readOnlyReason ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>DNSSEC is read-only here</AlertTitle>
            <AlertDescription>{readOnlyReason}</AlertDescription>
          </Alert>
        ) : null}

        <div className="linear-panel flex items-center gap-4 rounded-2xl px-4 py-4 text-card-foreground">
          <div
            className={`rounded-full p-3 ${
              signed ? "bg-emerald-500/12 text-emerald-400" : "bg-muted/70 text-muted-foreground"
            }`}
          >
            <ShieldCheck
              className="h-8 w-8"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.04em]">DNSSEC Status</h3>
            <p className="text-sm text-muted-foreground">
              {signed
                ? "This zone is signed and protected by DNSSEC."
                : "DNSSEC is not currently enabled. Generate keys and sign the zone to enable."}
            </p>
          </div>
          {signed && (
            <Badge className="ml-auto border border-emerald-500/30 bg-emerald-500/12 text-emerald-400">
              Signed
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!canManageDnssec || dnssecLoading}
            onClick={() => onGenerateKey("KSK")}
          >
            {dnssecLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate KSK
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!canManageDnssec || dnssecLoading}
            onClick={() => onGenerateKey("ZSK")}
          >
            {dnssecLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate ZSK
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            disabled={!canManageDnssec || dnssecLoading || managedKeys.filter((key) => key.status === "active").length === 0}
            onClick={onSignZone}
          >
            <ShieldCheck className="h-4 w-4" />
            Sign Zone
          </Button>
        </div>

        {managedKeys.length > 0 && (
          <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
            <div className="border-b p-6">
              <h3 className="text-lg font-semibold tracking-[-0.04em]">Managed DNS Keys</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-mono">{key.keyTag}</TableCell>
                    <TableCell>
                      <Badge variant={key.keyType === "KSK" ? "default" : "secondary"}>
                        {key.keyType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{key.algorithm}</TableCell>
                    <TableCell>{key.keySize}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          key.status === "active"
                            ? "default"
                            : key.status === "retired"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {key.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {key.status === "active" && canManageDnssec && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => onRetireKey(key.id)}
                        >
                          Retire
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {dnssec?.enabled && (
          <>
            <Card className="linear-panel border-border/60 bg-card/78 p-6 shadow-none">
              <div className="mb-4">
                <h3 className="mb-1 text-lg font-semibold tracking-[-0.04em]">DS Record</h3>
                <p className="text-sm text-muted-foreground">
                  Add this record to your domain registrar to enable the chain of trust.
                </p>
              </div>

              {dnssec.ds_record ? (
                <div className="group relative break-all rounded-2xl border border-border/60 bg-background/55 p-4 font-mono text-xs">
                  {dnssec.ds_record}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onCopyDsRecord(dnssec.ds_record || "")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
                  DS Record file (dsset-{zoneDomain}.) not found.
                </div>
              )}
            </Card>

            <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
              <div className="border-b p-6">
                <h3 className="text-lg font-semibold tracking-[-0.04em]">Detected DNS Keys (from BIND9)</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key ID (Tag)</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Algorithm</TableHead>
                    <TableHead>File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dnssec.keys.map((key) => (
                    <TableRow key={`${key.id}-${key.file}`}>
                      <TableCell className="font-mono">{key.id}</TableCell>
                      <TableCell>
                        <Badge variant={key.type === "KSK" ? "default" : "secondary"}>
                          {key.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{key.algorithm}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{key.file}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
