import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw, Shield } from "lucide-react";

import {
  AclFormDialog,
  AclListCard,
  TsigKeyFormDialog,
  TsigKeysCard,
  normalizeAclNetworks,
} from "@/components/security";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import { validateAclForm, validateTsigKeyForm } from "@/lib/client-schemas";
import {
  createAcl,
  createKey,
  deleteAcl,
  deleteKey,
  getAcls,
  getKeys,
  getStatus,
  updateAcl,
  type AclData,
  type KeyData,
  type StatusData,
} from "@/lib/api";

type SecuritySnapshot = {
  acls: AclData[];
  keys: KeyData[];
  status: StatusData | null;
};

type AclFormState = {
  name: string;
  networks: string;
  comment: string;
};

type KeyFormState = {
  name: string;
  algorithm: "hmac-sha256" | "hmac-sha512" | "hmac-md5";
  secret: string;
};

type DeleteTarget =
  | { type: "acl"; item: AclData }
  | { type: "key"; item: KeyData }
  | null;

function collectFieldErrors<T extends string>(
  issues: Array<{ path: Array<string | number>; message: string }>,
) {
  const next: Partial<Record<T, string>> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "") as T;
    if (field && !next[field]) {
      next[field] = issue.message;
    }
  }
  return next;
}

function getAclCapabilityReason(status: StatusData | null, canManageDNS: boolean) {
  if (!canManageDNS) {
    return "Your role does not allow DNS security changes.";
  }
  if (!status?.management) {
    return "";
  }
  if (!status.management.available) {
    return "BIND9 management is unavailable on the current target.";
  }
  if (!status.management.includes.namedConfAclsIncluded) {
    return "named.conf.acls is not included by the target's main BIND configuration.";
  }
  if (!status.management.writablePaths.namedConfAcls || !status.management.features.acls) {
    return "named.conf.acls is not writable on the current target.";
  }
  return "";
}

function getKeyCapabilityReason(status: StatusData | null, canManageDNS: boolean) {
  if (!canManageDNS) {
    return "Your role does not allow DNS security changes.";
  }
  if (!status?.management) {
    return "";
  }
  if (!status.management.available) {
    return "BIND9 management is unavailable on the current target.";
  }
  if (!status.management.includes.namedConfKeysIncluded) {
    return "named.conf.keys is not included by the target's main BIND configuration.";
  }
  if (!status.management.writablePaths.namedConfKeys || !status.management.features.keys) {
    return "named.conf.keys is not writable on the current target.";
  }
  return "";
}

export default function ACLs() {
  const { toast } = useToast();
  const { canManageDNS } = useAuth();

  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [editingAcl, setEditingAcl] = useState<AclData | null>(null);
  const [aclForm, setAclForm] = useState<AclFormState>({
    name: "",
    networks: "",
    comment: "",
  });
  const [aclErrors, setAclErrors] = useState<Partial<Record<"name" | "networks" | "comment", string>>>({});

  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyForm, setKeyForm] = useState<KeyFormState>({
    name: "",
    algorithm: "hmac-sha256",
    secret: "",
  });
  const [keyErrors, setKeyErrors] = useState<Partial<Record<"name" | "algorithm" | "secret", string>>>({});

  const [aclSaving, setAclSaving] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const { data, error, isPending, isFetching, refetch } = useQuery<SecuritySnapshot>({
    queryKey: ["security-page"],
    queryFn: async () => {
      const [acls, keys] = await Promise.all([getAcls(), getKeys()]);
      const status = await getStatus().catch(() => null);
      return { acls, keys, status };
    },
  });

  const aclList = data?.acls ?? [];
  const keyList = data?.keys ?? [];
  const status = data?.status ?? null;
  const targetLabel = status?.hostname || "Serveur local";
  const management = status?.management;
  const aclCapabilityReason = getAclCapabilityReason(status, canManageDNS);
  const keyCapabilityReason = getKeyCapabilityReason(status, canManageDNS);
  const canWriteAcls = canManageDNS && !aclCapabilityReason;
  const canWriteKeys = canManageDNS && !keyCapabilityReason;

  const resetAclForm = () => {
    setEditingAcl(null);
    setAclForm({ name: "", networks: "", comment: "" });
    setAclErrors({});
  };

  const resetKeyForm = () => {
    setKeyForm({ name: "", algorithm: "hmac-sha256", secret: "" });
    setKeyErrors({});
  };

  const openCreateAcl = () => {
    resetAclForm();
    setAclDialogOpen(true);
  };

  const openTrustedTransferAcl = () => {
    setEditingAcl(null);
    setAclErrors({});
    setAclForm({
      name: "trusted-transfer",
      networks: "192.168.1.10;\n192.168.1.11;",
      comment: "Secondary servers allowed to receive zone transfers",
    });
    setAclDialogOpen(true);
  };

  const openEditAcl = (acl: AclData) => {
    setEditingAcl(acl);
    setAclErrors({});
    setAclForm({
      name: acl.name,
      networks: acl.networks,
      comment: acl.comment || "",
    });
    setAclDialogOpen(true);
  };

  const handleSaveAcl = async () => {
    const parsed = validateAclForm(aclForm);
    if (!parsed.success) {
      setAclErrors(collectFieldErrors(parsed.error.issues));
      return;
    }

    if (!canWriteAcls) {
      toast({ title: "Read-only ACL target", description: aclCapabilityReason, variant: "destructive" });
      return;
    }

    try {
      setAclSaving(true);
      const payload = {
        name: parsed.data.name,
        networks: normalizeAclNetworks(parsed.data.networks),
        comment: parsed.data.comment || undefined,
      };

      if (editingAcl) {
        await updateAcl(editingAcl.id, payload);
        toast({ title: "ACL updated", description: `${payload.name} was updated on ${targetLabel}.` });
      } else {
        await createAcl(payload);
        toast({ title: "ACL created", description: `${payload.name} was created on ${targetLabel}.` });
      }

      setAclDialogOpen(false);
      resetAclForm();
      await refetch();
    } catch (e: any) {
      toast({ title: "ACL save failed", description: e.message, variant: "destructive" });
    } finally {
      setAclSaving(false);
    }
  };

  const handleSaveKey = async () => {
    const parsed = validateTsigKeyForm(keyForm);
    if (!parsed.success) {
      setKeyErrors(collectFieldErrors(parsed.error.issues));
      return;
    }

    if (!canWriteKeys) {
      toast({ title: "Read-only key target", description: keyCapabilityReason, variant: "destructive" });
      return;
    }

    try {
      setKeySaving(true);
      await createKey(parsed.data);
      toast({ title: "TSIG key created", description: `${parsed.data.name} was created on ${targetLabel}.` });
      setKeyDialogOpen(false);
      resetKeyForm();
      await refetch();
    } catch (e: any) {
      toast({ title: "Key creation failed", description: e.message, variant: "destructive" });
    } finally {
      setKeySaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeleteBusy(true);
      if (deleteTarget.type === "acl") {
        await deleteAcl(deleteTarget.item.id);
        toast({ title: "ACL deleted", description: `${deleteTarget.item.name} was removed from ${targetLabel}.` });
      } else {
        await deleteKey(deleteTarget.item.id);
        toast({ title: "TSIG key deleted", description: `${deleteTarget.item.name} was removed from ${targetLabel}.` });
      }
      setDeleteTarget(null);
      await refetch();
    } catch (e: any) {
      toast({ title: "Deletion failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  };

  if (isPending) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading security settings"
          description="Reading ACLs, TSIG keys, and management capability data."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageState
          tone="danger"
          title="Security settings unavailable"
          description={error instanceof Error ? error.message : "Unable to load ACLs and TSIG keys."}
          action={<Button onClick={() => refetch()}>Retry</Button>}
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Listes de Controle (ACL) & Cles TSIG"
          description="Gestion des regles de filtrage reseau et des cles cryptographiques de transfert de zone."
          icon={Shield}
          badge={
            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[10px] text-primary">
              Appliance locale
            </Badge>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
                Actualiser
              </Button>
              {canWriteAcls ? (
                <Button
                  variant="outline"
                  className="h-10 rounded-xl border-border/70 bg-background/70 shadow-none"
                  onClick={openTrustedTransferAcl}
                >
                  Creer trusted-transfer
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Listes d'Acces (ACL)"
            value={aclList.length}
            description="Regles d'acces reseau actives"
            icon={Shield}
            tone="success"
          />
          <MetricCard
            label="Cles TSIG"
            value={keyList.length}
            description="Cles de transfert autorisees"
            icon={KeyRound}
          />
          <MetricCard
            label="Fichier named.conf.acls"
            value={management ? (management.includes.namedConfAclsIncluded ? "Inclus" : "Absent") : "Inconnu"}
            description={management ? (management.writablePaths.namedConfAcls ? "Ecriture" : "Lecture seule") : "Indisponible"}
            icon={management?.includes.namedConfAclsIncluded ? CheckCircle2 : AlertTriangle}
            tone={management?.includes.namedConfAclsIncluded ? "success" : "warning"}
          />
          <MetricCard
            label="Fichier named.conf.keys"
            value={management ? (management.includes.namedConfKeysIncluded ? "Inclus" : "Absent") : "Inconnu"}
            description={management ? (management.writablePaths.namedConfKeys ? "Ecriture" : "Lecture seule") : "Indisponible"}
            icon={management?.includes.namedConfKeysIncluded ? CheckCircle2 : AlertTriangle}
            tone={management?.includes.namedConfKeysIncluded ? "success" : "warning"}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-3.5 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Hôte cible :</span>
            <span className="font-mono text-foreground font-medium">{targetLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>named.conf.acls :</span>
              <span className={management?.writablePaths.namedConfAcls ? "font-medium text-emerald-500" : "font-medium text-amber-500"}>
                {management?.writablePaths.namedConfAcls ? "Écriture" : "Lecture seule"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>named.conf.keys :</span>
              <span className={management?.writablePaths.namedConfKeys ? "font-medium text-emerald-500" : "font-medium text-amber-500"}>
                {management?.writablePaths.namedConfKeys ? "Écriture" : "Lecture seule"}
              </span>
            </div>
          </div>
        </div>

        

        {!canWriteAcls || !canWriteKeys ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Mode lecture seule partiel</AlertTitle>
            <AlertDescription className="space-y-1">
              {!canWriteAcls ? <div>ACLs : {aclCapabilityReason}</div> : null}
              {!canWriteKeys ? <div>Cles TSIG : {keyCapabilityReason}</div> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <AclListCard
            acls={aclList}
            canManage={canWriteAcls}
            onCreate={openCreateAcl}
            onEdit={openEditAcl}
            onDelete={(acl) => setDeleteTarget({ type: "acl", item: acl })}
          />
          <TsigKeysCard
            keys={keyList}
            canManage={canWriteKeys}
            onCreate={() => {
              resetKeyForm();
              setKeyDialogOpen(true);
            }}
            onDelete={(key) => setDeleteTarget({ type: "key", item: key })}
          />
        </div>

        <AclFormDialog
          open={aclDialogOpen}
          saving={aclSaving}
          editing={Boolean(editingAcl)}
          values={aclForm}
          errors={aclErrors}
          onOpenChange={(open) => {
            setAclDialogOpen(open);
            if (!open) {
              resetAclForm();
            }
          }}
          onChange={(field, value) => {
            setAclForm((current) => ({ ...current, [field]: value }));
            setAclErrors((current) => ({ ...current, [field]: undefined }));
          }}
          onSubmit={handleSaveAcl}
        />

        <TsigKeyFormDialog
          open={keyDialogOpen}
          saving={keySaving}
          values={keyForm}
          errors={keyErrors}
          onOpenChange={(open) => {
            setKeyDialogOpen(open);
            if (!open) {
              resetKeyForm();
            }
          }}
          onNameChange={(value) => {
            setKeyForm((current) => ({ ...current, name: value }));
            setKeyErrors((current) => ({ ...current, name: undefined }));
          }}
          onAlgorithmChange={(value) => {
            setKeyForm((current) => ({ ...current, algorithm: value }));
            setKeyErrors((current) => ({ ...current, algorithm: undefined }));
          }}
          onSecretChange={(value) => {
            setKeyForm((current) => ({ ...current, secret: value }));
            setKeyErrors((current) => ({ ...current, secret: undefined }));
          }}
          onSubmit={handleSaveKey}
        />

        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.type === "acl" ? (
                  <>
                    Delete ACL <strong>{deleteTarget.item.name}</strong> from the active target?
                  </>
                ) : deleteTarget?.type === "key" ? (
                  <>
                    Delete TSIG key <strong>{deleteTarget.item.name}</strong> from the active target?
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteConfirmed}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
