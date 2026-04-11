import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { User, InsertUser, insertUserSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Trash2, UserPlus, Loader2, Users, ShieldAlert, Pencil } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<string>("viewer");
  const [editPassword, setEditPassword] = useState<string>("");

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: { username: "", password: "", role: "viewer" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        let message = "Failed to create user";
        try { const err = await res.json(); message = err.message || message; } catch {}
        throw new Error(message);
      }
      try { return await res.json(); } catch { return null; }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset();
      toast({ title: "User created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to create user", description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { role?: string; password?: string } }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        let message = "Failed to update user";
        try { const err = await res.json(); message = err.message || message; } catch {}
        throw new Error(message);
      }
      try { return await res.json(); } catch { return null; }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      setEditPassword("");
      toast({ title: "User updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to update user", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let message = "Failed to delete user";
        try { const err = await res.json(); message = err.message || message; } catch {}
        throw new Error(message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to delete user", description: err.message });
    },
  });

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <div className="text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mb-3" />
            <h4 className="font-semibold">Access Denied</h4>
            <p className="text-muted-foreground">You need admin role to access this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const roleBadge = (role: string) => {
    if (role === "admin") return <Badge variant="destructive">{role}</Badge>;
    if (role === "operator") return <Badge className="bg-green-600">{role}</Badge>;
    return <Badge variant="secondary">{role}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Create and manage admin panel users and roles.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Add User Form */}
        <Card className="lg:col-span-4">
          <CardHeader className="border-b flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <CardTitle>Add New User</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="john.doe"
                  {...form.register("username")}
                />
                {form.formState.errors.username && (
                  <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={form.watch("role")}
                  onValueChange={(v) => form.setValue("role", v as "admin" | "operator" | "viewer")}
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> Create User</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="lg:col-span-8">
          <CardHeader className="border-b flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle>Users</CardTitle>
            {users && (
              <Badge variant="secondary" className="ml-auto">{users.length}</Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Username</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Role</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Created At</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted-foreground py-8">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : users?.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted-foreground py-8">No users found.</td>
                    </tr>
                  ) : (
                    users?.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold">{u.username}</td>
                        <td className="px-4 py-3">{roleBadge(u.role)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditTarget(u); setEditRole(u.role); setEditPassword(""); }}
                            title="Edit user"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDeleteTarget(u)}
                            disabled={u.id === user?.id || deleteMutation.isPending}
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {editTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={() => {
                if (!editTarget) return;
                const data: { role?: string; password?: string } = {};
                if (editRole !== editTarget.role) data.role = editRole;
                if (editPassword) data.password = editPassword;
                if (Object.keys(data).length === 0) {
                  toast({ title: "No changes" });
                  return;
                }
                updateMutation.mutate({ id: editTarget.id, data });
              }}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user <strong>{deleteTarget?.username}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
            }}>
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
