import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Plus, Key, Lock, Trash2, Edit, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAcls, createAcl, updateAcl, deleteAcl, getKeys, createKey, deleteKey, type AclData, type KeyData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ACLs() {
  const [aclList, setAclList] = useState<AclData[]>([]);
  const [keyList, setKeyList] = useState<KeyData[]>([]);
  const [loading, setLoading] = useState(true);

  // ACL dialog
  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclName, setAclName] = useState("");
  const [aclNetworks, setAclNetworks] = useState("");
  const [aclComment, setAclComment] = useState("");
  const [editingAcl, setEditingAcl] = useState<AclData | null>(null);

  // Key dialog
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyAlgorithm, setKeyAlgorithm] = useState("hmac-sha256");
  const [keySecret, setKeySecret] = useState("");

  const [saving, setSaving] = useState(false);
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

  // ── ACL handlers ─────────────────────────────────────
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
    if (!confirm(`Delete ACL '${acl.name}'?`)) return;
    try {
      await deleteAcl(acl.id);
      toast({ title: "Deleted", description: `ACL '${acl.name}' removed` });
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

  // ── Key handlers ─────────────────────────────────────
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
    if (!confirm(`Delete TSIG key '${key.name}'?`)) return;
    try {
      await deleteKey(key.id);
      toast({ title: "Deleted", description: `Key '${key.name}' removed` });
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Helper for Trusted Transfer ───────────────────────
  const handleCreateTrustedTransfer = () => {
    setAclName("trusted-transfer");
    setAclNetworks("192.168.1.50; // IP of your NS2");
    setAclComment("Allow zone transfers to secondary nameservers");
    setEditingAcl(null); // Ensure we are creating new
    setAclDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Security Settings</h1>
          <p className="text-muted-foreground mt-1">Manage Access Control Lists and TSIG Keys for server security.</p>
        </div>
        <div className="flex gap-2">
          {canManageDNS && (
            <>
              {/* Key Dialog */}
              <Dialog open={keyDialogOpen} onOpenChange={(open) => { setKeyDialogOpen(open); if (!open) { setKeyName(""); setKeySecret(""); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-primary/20">
                    <Key className="w-4 h-4" /> New Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card/95 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle>Create TSIG Key</DialogTitle>
                    <DialogDescription>Add a shared secret for secure zone transfers.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Name</Label>
                      <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="transfer-key" className="col-span-3 font-mono" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Algorithm</Label>
                      <Select value={keyAlgorithm} onValueChange={setKeyAlgorithm}>
                        <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hmac-sha256">HMAC-SHA256</SelectItem>
                          <SelectItem value="hmac-sha512">HMAC-SHA512</SelectItem>
                          <SelectItem value="hmac-md5">HMAC-MD5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Secret</Label>
                      <Input value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder="Base64 encoded secret" className="col-span-3 font-mono" type="password" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveKey} disabled={saving}>
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Key
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ACL Dialog */}
              <Dialog open={aclDialogOpen} onOpenChange={(open) => { setAclDialogOpen(open); if (!open) resetAclForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                    <Plus className="w-4 h-4" /> Add ACL
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card/95 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle>{editingAcl ? "Edit ACL" : "Create ACL"}</DialogTitle>
                    <DialogDescription>Define named address matches for security rules.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Name</Label>
                      <Input value={aclName} onChange={e => setAclName(e.target.value)} placeholder="trusted-clients" className="col-span-3 font-mono" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Networks</Label>
                      <Input value={aclNetworks} onChange={e => setAclNetworks(e.target.value)} placeholder="127.0.0.1; 192.168.1.0/24;" className="col-span-3 font-mono" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Comment</Label>
                      <Input value={aclComment} onChange={e => setAclComment(e.target.value)} placeholder="Optional description" className="col-span-3" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveAcl} disabled={saving}>
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {editingAcl ? "Update ACL" : "Create ACL"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Alert className="mb-6 glass-panel border-blue-500/30 bg-blue-500/10">
        <Shield className="h-4 w-4 text-blue-400" />
        <AlertTitle className="text-blue-400 ml-2">Zone Transfer Security</AlertTitle>
        <AlertDescription className="text-blue-200/80 mt-2">
          By default, Zone Transfers are blocked (`allow-transfer {"{ none; }"}`).
          To authorize your secondary servers (NS2, NS3), create an ACL named
          <code className="bg-black/30 px-1 py-0.5 rounded mx-1 text-yellow-400 font-mono">trusted-transfer</code>
          containing their IPs.
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={handleCreateTrustedTransfer} className="border-blue-500/30 hover:bg-blue-500/20 text-blue-300">
              <Plus className="w-3 h-3 mr-2" /> Setup "trusted-transfer" ACL
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-panel border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Access Control Lists
            </CardTitle>
            <CardDescription>Named address matches for security blocks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aclList.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                No ACLs configured. Click "Add ACL" to create one.
              </div>
            ) : (
              aclList.map((acl) => (
                <div key={acl.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card/30 group">
                  <div className="space-y-1">
                    <div className="font-mono text-sm font-bold text-primary">{acl.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{acl.networks}</div>
                    {acl.comment && <div className="text-xs text-muted-foreground italic">{acl.comment}</div>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canManageDNS && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditAcl(acl)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAcl(acl)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> TSIG Keys
            </CardTitle>
            <CardDescription>Shared secrets for secure zone transfers and updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {keyList.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                No TSIG keys configured. Click "New Key" to create one.
              </div>
            ) : (
              keyList.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card/30 group">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary">{key.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 py-0">{key.algorithm}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{key.secret}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canManageDNS && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteKey(key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}