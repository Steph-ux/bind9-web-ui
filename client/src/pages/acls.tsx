import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Shield, Plus, Key, Lock, Trash2, Edit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAcls, createAcl, updateAcl, deleteAcl, getKeys, createKey, deleteKey, type AclData, type KeyData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function ACLs() {
  const [aclList, setAclList] = useState<AclData[]>([]);
  const [keyList, setKeyList] = useState<KeyData[]>([]);
  const [loading, setLoading] = useState(true);

  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclName, setAclName] = useState("");
  const [aclNetworks, setAclNetworks] = useState("");
  const [aclComment, setAclComment] = useState("");
  const [editingAcl, setEditingAcl] = useState<AclData | null>(null);

  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyAlgorithm, setKeyAlgorithm] = useState("hmac-sha256");
  const [keySecret, setKeySecret] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'acl' | 'key'; item: AclData | KeyData } | null>(null);
  const { toast } = useToast();
  const { canManageDNS } = useAuth();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [acls, keys] = await Promise.all([getAcls(), getKeys()]);
      setAclList(acls);
      setKeyList(keys);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveAcl = async () => {
    if (!aclName.trim() || !aclNetworks.trim()) {
      toast({ title: "Error", description: "Name and networks are required", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      if (editingAcl) {
        await updateAcl(editingAcl.id, { name: aclName, networks: aclNetworks, comment: aclComment });
        toast({ title: "Updated", description: `ACL '${aclName}' updated` });
      } else {
        await createAcl({ name: aclName, networks: aclNetworks, comment: aclComment || undefined });
        toast({ title: "Created", description: `ACL '${aclName}' created` });
      }
      setAclDialogOpen(false);
      resetAclForm();
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditAcl = (acl: AclData) => {
    setEditingAcl(acl);
    setAclName(acl.name);
    setAclNetworks(acl.networks);
    setAclComment(acl.comment || "");
    setAclDialogOpen(true);
  };

  const handleDeleteAcl = async (acl: AclData) => {
    try {
      await deleteAcl(acl.id);
      toast({ title: "Deleted", description: `ACL '${acl.name}' removed` });
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const resetAclForm = () => {
    setEditingAcl(null);
    setAclName("");
    setAclNetworks("");
    setAclComment("");
  };

  const handleSaveKey = async () => {
    if (!keyName.trim() || !keySecret.trim()) {
      toast({ title: "Error", description: "Name and secret are required", variant: "destructive" });
      return;
    }
    try {
      setSaving(true);
      await createKey({ name: keyName, algorithm: keyAlgorithm, secret: keySecret });
      toast({ title: "Created", description: `TSIG key '${keyName}' created` });
      setKeyDialogOpen(false);
      setKeyName("");
      setKeySecret("");
      setKeyAlgorithm("hmac-sha256");
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (key: KeyData) => {
    try {
      await deleteKey(key.id);
      toast({ title: "Deleted", description: `Key '${key.name}' removed` });
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const handleCreateTrustedTransfer = () => {
    setAclName("trusted-transfer");
    setAclNetworks("192.168.1.50; // IP of your NS2");
    setAclComment("Allow zone transfers to secondary nameservers");
    setEditingAcl(null);
    setAclDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Settings</h2>
          <p className="text-muted-foreground">Manage Access Control Lists and TSIG Keys for server security.</p>
        </div>
        <div className="flex gap-2">
          {canManageDNS && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setKeyDialogOpen(true)}>
                <Key className="h-4 w-4" /> New Key
              </Button>
              <Button className="gap-2" onClick={() => { resetAclForm(); setAclDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Add ACL
              </Button>
            </>
          )}
        </div>
      </div>

      <Alert className="mb-6">
        <Shield className="h-4 w-4" />
        <AlertTitle className="font-semibold">Zone Transfer Security</AlertTitle>
        <AlertDescription>
          By default, Zone Transfers are blocked (<code className="rounded bg-muted px-1">allow-transfer {"{ none; }"}</code>).
          To authorize your secondary servers (NS2, NS3), create an ACL named
          <code className="rounded bg-zinc-900 dark:bg-zinc-900 text-yellow-400 dark:text-yellow-400 px-1.5 py-0.5 mx-1 font-mono">trusted-transfer</code>
          containing their IPs.
        </AlertDescription>
        <div className="mt-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleCreateTrustedTransfer}>
            <Plus className="h-3 w-3" /> Setup "trusted-transfer" ACL
          </Button>
        </div>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ACLs List */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Access Control Lists</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">Named address matches for security blocks.</p>
            {aclList.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No ACLs configured. Click "Add ACL" to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {aclList.map((acl) => (
                  <div key={acl.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                    <div>
                      <div className="font-mono font-bold text-primary mb-1">{acl.name}</div>
                      <div className="text-muted-foreground font-mono text-sm">{acl.networks}</div>
                      {acl.comment && <div className="text-muted-foreground italic mt-1 text-xs">{acl.comment}</div>}
                    </div>
                    <div className="flex gap-1">
                      {canManageDNS && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditAcl(acl)}>
                            <Edit className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget({ type: 'acl', item: acl })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keys List */}
        <Card>
          <CardHeader className="border-b flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>TSIG Keys</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">Shared secrets for secure zone transfers and updates.</p>
            {keyList.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No TSIG keys configured. Click "New Key" to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {keyList.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-primary">{key.name}</span>
                        <Badge variant="secondary" className="text-[10px] rounded-full">{key.algorithm}</Badge>
                      </div>
                      <div className="text-muted-foreground font-mono text-sm truncate max-w-[250px]">
                        {key.secret}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {canManageDNS && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget({ type: 'key', item: key })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Key Dialog */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create TSIG Key</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Add a shared secret for secure zone transfers.</p>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="keyName">Name</Label>
              <Input id="keyName" className="font-mono" value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="transfer-key" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="keyAlgo">Algorithm</Label>
              <Select value={keyAlgorithm} onValueChange={setKeyAlgorithm}>
                <SelectTrigger id="keyAlgo">
                  <SelectValue placeholder="Select algorithm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hmac-sha256">HMAC-SHA256</SelectItem>
                  <SelectItem value="hmac-sha512">HMAC-SHA512</SelectItem>
                  <SelectItem value="hmac-md5">HMAC-MD5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="keySecret">Secret</Label>
              <Input id="keySecret" type="password" className="font-mono" value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder="Base64 encoded secret" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveKey} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACL Dialog */}
      <Dialog open={aclDialogOpen} onOpenChange={(open) => { if (!open) resetAclForm(); setAclDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAcl ? "Edit ACL" : "Create ACL"}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Define named address matches for security rules.</p>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="aclName">Name</Label>
              <Input id="aclName" className="font-mono" value={aclName} onChange={e => setAclName(e.target.value)} placeholder="trusted-clients" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aclNetworks">Networks</Label>
              <Input id="aclNetworks" className="font-mono" value={aclNetworks} onChange={e => setAclNetworks(e.target.value)} placeholder="127.0.0.1; 192.168.1.0/24;" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aclComment">Comment</Label>
              <Input id="aclComment" value={aclComment} onChange={e => setAclComment(e.target.value)} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAclDialogOpen(false); resetAclForm(); }}>Cancel</Button>
            <Button onClick={handleSaveAcl} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingAcl ? "Update ACL" : "Create ACL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'acl'
                ? <>Are you sure you want to delete ACL <strong>{(deleteTarget?.item as AclData)?.name}</strong>?</>
                : <>Are you sure you want to delete TSIG key <strong>{(deleteTarget?.item as KeyData)?.name}</strong>?</>
              }
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteTarget?.type === 'acl') handleDeleteAcl(deleteTarget.item as AclData);
              else if (deleteTarget?.type === 'key') handleDeleteKey(deleteTarget.item as KeyData);
            }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
