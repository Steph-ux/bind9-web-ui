import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, Copy, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageState } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createRecord,
  deleteRecord,
  generateDnssecKey,
  getDnssecKeys,
  getDnssecStatus,
  getRecords,
  getZone,
  getZoneDnssecInfo,
  retireDnssecKey,
  signZone,
  updateRecord,
  type DnssecKeyEntry,
  type DnssecStatus,
  type RecordData,
  type ZoneDetail,
  type ZoneDnssecInfo,
} from "@/lib/api";
import {
  recordPriorityTypes,
  validateRecordForm,
  type RecordFormValues,
} from "@/lib/client-schemas";
import { useToast } from "@/hooks/use-toast";
import {
  RecordDeleteDialog,
  RecordFormDialog,
  ZoneDnssecTab,
  ZoneRecordsTab,
} from "@/components/zone-editor";

interface DnssecSnapshot {
  dnssec: ZoneDnssecInfo | null;
  managedKeys: DnssecKeyEntry[];
  dnssecStatus: DnssecStatus | null;
  error: string | null;
}

const EMPTY_DNSSEC_SNAPSHOT: DnssecSnapshot = {
  dnssec: null,
  managedKeys: [],
  dnssecStatus: null,
  error: null,
};

export default function ZoneEditor() {
  const [, params] = useRoute("/zones/:id");
  const zoneId = params?.id;

  const [zone, setZone] = useState<ZoneDetail | null>(null);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [dnssec, setDnssec] = useState<ZoneDnssecInfo | null>(null);
  const [managedKeys, setManagedKeys] = useState<DnssecKeyEntry[]>([]);
  const [dnssecStatus, setDnssecStatus] = useState<DnssecStatus | null>(null);
  const [dnssecLoading, setDnssecLoading] = useState(false);
  const [dnssecError, setDnssecError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecordData | null>(null);
  const [editTarget, setEditTarget] = useState<RecordData | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("A");
  const [editValue, setEditValue] = useState("");
  const [editTTL, setEditTTL] = useState("3600");
  const [editPriority, setEditPriority] = useState("");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("A");
  const [newValue, setNewValue] = useState("");
  const [newTTL, setNewTTL] = useState("3600");
  const [newPriority, setNewPriority] = useState("");
  const [newErrors, setNewErrors] = useState<Partial<Record<keyof RecordFormValues, string>>>({});
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof RecordFormValues, string>>>({});

  const { toast } = useToast();
  const { canManageDNS } = useAuth();

  const applyDnssecSnapshot = (snapshot: DnssecSnapshot) => {
    setDnssec(snapshot.dnssec);
    setManagedKeys(snapshot.managedKeys);
    setDnssecStatus(snapshot.dnssecStatus);
    setDnssecError(snapshot.error);
  };

  const loadDnssecState = async (): Promise<DnssecSnapshot> => {
    if (!zoneId) return EMPTY_DNSSEC_SNAPSHOT;

    const [dnssecInfo, keys, status] = await Promise.allSettled([
      getZoneDnssecInfo(zoneId),
      getDnssecKeys(zoneId),
      getDnssecStatus(zoneId),
    ]);

    const unavailableParts: string[] = [];

    if (dnssecInfo.status !== "fulfilled") {
      unavailableParts.push("zone signing metadata");
    }
    if (keys.status !== "fulfilled") {
      unavailableParts.push("managed DNSSEC keys");
    }
    if (status.status !== "fulfilled") {
      unavailableParts.push("signing status");
    }

    return {
      dnssec: dnssecInfo.status === "fulfilled" ? dnssecInfo.value : null,
      managedKeys: keys.status === "fulfilled" ? keys.value : [],
      dnssecStatus: status.status === "fulfilled" ? status.value : null,
      error:
        unavailableParts.length === 0
          ? null
          : unavailableParts.length === 3
            ? "DNSSEC details are currently unavailable for this zone."
            : `Some DNSSEC details are temporarily unavailable: ${unavailableParts.join(", ")}.`,
    };
  };

  const refreshDnssecState = async () => {
    const snapshot = await loadDnssecState();
    applyDnssecSnapshot(snapshot);
    return snapshot;
  };

  const dnssecSigned = dnssec?.enabled || dnssecStatus?.signed;
  const zoneSupportsWrites = zone?.type === "master";
  const canManageZone = canManageDNS && zoneSupportsWrites;
  const readOnlyReason = !zoneSupportsWrites
    ? `This ${zone?.type || "non-master"} zone can be inspected here, but record and DNSSEC changes are limited to master zones.`
    : !canManageDNS
      ? "Your current role can inspect this zone, but it cannot change records or DNSSEC state."
      : null;
  const newRecordValues: RecordFormValues = {
    name: newName,
    type: newType as RecordFormValues["type"],
    value: newValue,
    ttl: newTTL,
    priority: newPriority,
  };
  const editRecordValues: RecordFormValues = {
    name: editName,
    type: editType as RecordFormValues["type"],
    value: editValue,
    ttl: editTTL,
    priority: editPriority,
  };

  const clearRecordError = (
    setErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof RecordFormValues, string>>>>,
    field: keyof RecordFormValues,
  ) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const updateCreateField = <K extends keyof RecordFormValues>(field: K, value: RecordFormValues[K]) => {
    if (field === "name") setNewName(value as string);
    if (field === "type") {
      setNewType(value as string);
      if (!recordPriorityTypes.includes(value as (typeof recordPriorityTypes)[number])) {
        setNewPriority("");
        clearRecordError(setNewErrors, "priority");
      }
    }
    if (field === "value") setNewValue(value as string);
    if (field === "ttl") setNewTTL(value as string);
    if (field === "priority") setNewPriority(value as string);
    clearRecordError(setNewErrors, field);
  };

  const updateEditField = <K extends keyof RecordFormValues>(field: K, value: RecordFormValues[K]) => {
    if (field === "name") setEditName(value as string);
    if (field === "type") {
      setEditType(value as string);
      if (!recordPriorityTypes.includes(value as (typeof recordPriorityTypes)[number])) {
        setEditPriority("");
        clearRecordError(setEditErrors, "priority");
      }
    }
    if (field === "value") setEditValue(value as string);
    if (field === "ttl") setEditTTL(value as string);
    if (field === "priority") setEditPriority(value as string);
    clearRecordError(setEditErrors, field);
  };

  const collectRecordErrors = (values: RecordFormValues) => {
    const validation = validateRecordForm(values);
    if (validation.success) {
      return { success: true as const, data: validation.data, errors: {} };
    }

    const errors: Partial<Record<keyof RecordFormValues, string>> = {};
    for (const issue of validation.error.issues) {
      const key = issue.path[0] as keyof RecordFormValues | undefined;
      if (key && !errors[key]) {
        errors[key] = issue.message;
      }
    }

    return { success: false as const, errors };
  };

  const fetchData = async () => {
    if (!zoneId) return;

    try {
      setLoading(true);
      const [zoneData, recordData, dnssecSnapshot] = await Promise.all([
        getZone(zoneId),
        getRecords(zoneId),
        loadDnssecState(),
      ]);
      setZone(zoneData);
      setRecords(recordData);
      applyDnssecSnapshot(dnssecSnapshot);
      setError(null);
    } catch (requestError: any) {
      setError(requestError.message);
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [zoneId]);

  const filteredRecords = records.filter(
    (record) =>
      record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.value.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!zoneId) return;
    const validation = collectRecordErrors(newRecordValues);
    if (!validation.success) {
      setNewErrors(validation.errors);
      toast({ title: "Invalid record form", description: Object.values(validation.errors)[0], variant: "destructive" });
      return;
    }

    try {
      setCreating(true);
      await createRecord(zoneId, {
        name: validation.data.name,
        type: validation.data.type,
        value: validation.data.value,
        ttl: parseInt(validation.data.ttl, 10) || 3600,
        priority: validation.data.priority ? parseInt(validation.data.priority, 10) : null,
      });

      toast({ title: "Success", description: "Record created successfully" });
      setIsDialogOpen(false);
      setNewName("");
      setNewValue("");
      setNewPriority("");
      setNewErrors({});
      await fetchData();
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (record: RecordData) => {
    setEditTarget(record);
    setEditName(record.name);
    setEditType(record.type);
    setEditValue(record.value);
    setEditTTL(String(record.ttl));
    setEditPriority(record.priority != null ? String(record.priority) : "");
    setEditErrors({});
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const validation = collectRecordErrors(editRecordValues);
    if (!validation.success) {
      setEditErrors(validation.errors);
      toast({ title: "Invalid record form", description: Object.values(validation.errors)[0], variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      await updateRecord(editTarget.id, {
        name: validation.data.name,
        type: validation.data.type as RecordData["type"],
        value: validation.data.value,
        ttl: parseInt(validation.data.ttl, 10) || 3600,
        priority: validation.data.priority ? parseInt(validation.data.priority, 10) : null,
      });
      toast({ title: "Success", description: "Record updated successfully" });
      setEditTarget(null);
      setEditErrors({});
      await fetchData();
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: RecordData) => {
    try {
      await deleteRecord(record.id);
      toast({ title: "Success", description: "Record deleted" });
      setDeleteTarget(null);
      await fetchData();
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    }
  };

  const handleGenerateDnssecKey = async (keyType: "KSK" | "ZSK") => {
    if (!zoneId) return;

    setDnssecLoading(true);
    try {
      const result = await generateDnssecKey(zoneId, keyType);
      toast({
        title: result.success ? `${keyType} Generated` : "Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        await refreshDnssecState();
      }
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setDnssecLoading(false);
    }
  };

  const handleSignZone = async () => {
    if (!zoneId) return;

    setDnssecLoading(true);
    try {
      const result = await signZone(zoneId);
      toast({
        title: result.success ? "Zone Signed" : "Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        await refreshDnssecState();
      }
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setDnssecLoading(false);
    }
  };

  const handleRetireDnssecKey = async (keyId: string) => {
    if (!zoneId) return;

    try {
      const result = await retireDnssecKey(keyId);
      toast({
        title: result.success ? "Key Retired" : "Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        await refreshDnssecState();
      }
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast({ title: "Copied", description: "DS Record copied to clipboard" });
      })
      .catch(() => {
        toast({
          title: "Clipboard unavailable",
          description: "Copy the DS record manually from this page.",
          variant: "destructive",
        });
      });
  };

  if (loading && !zone) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading zone editor"
          description="Fetching zone details, records and DNSSEC state."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (!zone) {
    return (
      <DashboardLayout>
        <PageState
          title="Zone not found"
          description={error || "The requested zone could not be loaded."}
          tone="danger"
          action={
            <Link href="/zones">
              <Button variant="outline">Back to zones</Button>
            </Link>
          }
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/zones">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{zone.domain}</h1>
              <p className="text-sm text-muted-foreground">
                {records.length} records - {zone.type}
              </p>
            </div>
          </div>
          {canManageZone && (
            <div className="flex gap-2">
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Record
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Records"
            value={records.length}
            description="Total DNS records in this zone."
            icon={Copy}
          />
          <MetricCard
            label="Filtered Results"
            value={filteredRecords.length}
            description={searchTerm ? `Filter: ${searchTerm}` : "Current visible result set."}
            icon={Search}
          />
          <MetricCard
            label="DNSSEC"
            value={dnssecError ? "Partial" : dnssecSigned ? "Enabled" : "Disabled"}
            description={
              dnssecError
                ? "Zone records remain editable."
                : managedKeys.length > 0
                ? `${managedKeys.length} managed key(s)`
                : "No managed key detected."
            }
            icon={ShieldCheck}
            tone={dnssecError ? "warning" : dnssecSigned ? "success" : "warning"}
          />
          <MetricCard
            label="Editing"
            value={canManageZone ? "Writable" : "Read-only"}
            description={
              canManageZone
                ? "You can create and modify records."
                : readOnlyReason || "You can only inspect this zone."
            }
            icon={Pencil}
          />
        </div>

        {readOnlyReason ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Read-only zone view</AlertTitle>
            <AlertDescription>{readOnlyReason}</AlertDescription>
          </Alert>
        ) : null}

        {dnssecError ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>DNSSEC details partially unavailable</AlertTitle>
            <AlertDescription>
              Record editing is still available for this zone, but {dnssecError}
            </AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="records" className="w-full">
          <TabsList>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="dnssec">DNSSEC</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-4">
            <ZoneRecordsTab
              records={filteredRecords}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              canManageDNS={canManageZone}
              onEditRecord={openEdit}
              onDeleteRecord={setDeleteTarget}
            />
          </TabsContent>

          <TabsContent value="dnssec">
            <ZoneDnssecTab
              zoneDomain={zone.domain}
              dnssec={dnssec}
              dnssecStatus={dnssecStatus}
              dnssecError={dnssecError}
              canManageDnssec={canManageZone}
              readOnlyReason={readOnlyReason}
              managedKeys={managedKeys}
              dnssecLoading={dnssecLoading}
              onGenerateKey={handleGenerateDnssecKey}
              onSignZone={handleSignZone}
              onRetireKey={handleRetireDnssecKey}
              onCopyDsRecord={copyToClipboard}
            />
          </TabsContent>
        </Tabs>
      </div>

      {canManageZone && (
        <RecordFormDialog
          open={isDialogOpen}
          mode="create"
          zoneDomain={zone.domain}
          submitting={creating}
          values={newRecordValues}
          errors={newErrors}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setNewErrors({});
            }
          }}
          onFieldChange={updateCreateField}
          onSubmit={handleCreate}
        />
      )}

      {canManageZone && (
        <RecordFormDialog
          open={!!editTarget}
          mode="edit"
          zoneDomain={zone.domain}
          submitting={saving}
          values={editRecordValues}
          errors={editErrors}
          onOpenChange={(open) => {
            if (!open) {
              setEditTarget(null);
              setEditErrors({});
            }
          }}
          onFieldChange={updateEditField}
          onSubmit={handleEdit}
        />
      )}

      <RecordDeleteDialog
        record={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </DashboardLayout>
  );
}
