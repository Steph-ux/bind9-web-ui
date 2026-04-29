import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, RefreshCw, Shield, ShieldAlert, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { type UserRole, type ZoneAccessOption } from "@/components/users/user-types";
import { UserCreateCard } from "@/components/users/UserCreateCard";
import { UserDomainAccessDialog } from "@/components/users/UserDomainAccessDialog";
import { UsersTableCard } from "@/components/users/UsersTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import {
  createUser,
  deleteUser,
  getUserDomains,
  getUsers,
  getZones,
  type ManagedUser,
  setUserDomains,
  type CreateManagedUserInput,
  updateUser,
} from "@/lib/api";
import { managedUserCreateSchema } from "@/lib/client-schemas";

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [jailTarget, setJailTarget] = useState<ManagedUser | null>(null);
  const [jailZoneIds, setJailZoneIds] = useState<string[]>([]);
  const [jailAllZones, setJailAllZones] = useState<ZoneAccessOption[]>([]);
  const [jailLoading, setJailLoading] = useState(false);
  const [editRole, setEditRole] = useState<UserRole>("viewer");
  const [editPassword, setEditPassword] = useState("");
  const [editMustChangePassword, setEditMustChangePassword] = useState(false);

  const form = useForm<CreateManagedUserInput>({
    resolver: zodResolver(managedUserCreateSchema),
    defaultValues: { username: "", password: "", role: "viewer" },
  });

  const {
    data: users,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset({ username: "", password: "", role: "viewer" });
      toast({ title: "User created" });
    },
    onError: (mutationError: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: mutationError.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      setEditPassword("");
      toast({ title: "User updated" });
    },
    onError: (mutationError: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to update user",
        description: mutationError.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (mutationError: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to delete user",
        description: mutationError.message,
      });
    },
  });

  const domainAccessMutation = useMutation({
    mutationFn: ({ id, zoneIds }: { id: string; zoneIds: string[] }) => setUserDomains(id, zoneIds),
    onSuccess: () => {
      toast({ title: "Domain access updated" });
      closeDomainDialog();
    },
    onError: (mutationError: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to update domain access",
        description: mutationError.message,
      });
    },
  });

  const closeDomainDialog = () => {
    setJailTarget(null);
    setJailZoneIds([]);
    setJailAllZones([]);
    setJailLoading(false);
  };

  const openEditDialog = (managedUser: ManagedUser) => {
    setEditTarget(managedUser);
    setEditRole(managedUser.role);
    setEditPassword("");
    setEditMustChangePassword(managedUser.mustChangePassword);
  };

  const openDomainDialog = async (managedUser: ManagedUser) => {
    setJailTarget(managedUser);
    setJailZoneIds([]);
    setJailAllZones([]);
    setJailLoading(true);

    try {
      const [assignments, zones] = await Promise.all([getUserDomains(managedUser.id), getZones()]);
      setJailZoneIds(assignments.map((assignment) => assignment.zoneId));
      setJailAllZones(zones.map((zone) => ({ id: zone.id, domain: zone.domain })));
    } catch (domainError) {
      closeDomainDialog();
      toast({
        variant: "destructive",
        title: "Failed to load domain access",
        description:
          domainError instanceof Error ? domainError.message : "Unable to load zone assignments.",
      });
      return;
    }

    setJailLoading(false);
  };

  const handleEditSave = () => {
    if (!editTarget) {
      return;
    }

    if (editPassword && editPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Minimum 8 characters required.",
      });
      return;
    }

    const patch: Parameters<typeof updateUser>[1] = {};

    if (editRole !== editTarget.role) {
      patch.role = editRole;
    }

    if (editPassword) {
      patch.newPassword = editPassword;
    }

    if (editPassword || editMustChangePassword !== editTarget.mustChangePassword) {
      patch.mustChangePassword = editMustChangePassword;
    }

    if (Object.keys(patch).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }

    updateMutation.mutate({ id: editTarget.id, data: patch });
  };

  const managedUsers = users ?? [];
  const adminCount = managedUsers.filter((managedUser) => managedUser.role === "admin").length;
  const operatorCount = managedUsers.filter((managedUser) => managedUser.role === "operator").length;
  const viewerCount = managedUsers.filter((managedUser) => managedUser.role === "viewer").length;
  const resetCount = managedUsers.filter((managedUser) => managedUser.mustChangePassword).length;

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <PageState
          icon={ShieldAlert}
          tone="danger"
          title="Access denied"
          description="This page is restricted to administrator accounts."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="User Management"
          description="Create admin panel accounts, rotate credentials and scope viewer access to specific zones."
          icon={Users}
          badge={<Badge variant="outline">Admin only</Badge>}
          actions={
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={["h-4 w-4", isFetching ? "animate-spin" : ""].join(" ")} />
              {isFetching ? "Refreshing" : "Refresh"}
            </Button>
          }
        />

        {isPending ? (
          <PageState
            loading
            title="Loading users"
            description="Fetching accounts and access controls."
            className="min-h-[45vh]"
          />
        ) : error ? (
          <PageState
            icon={ShieldAlert}
            tone="danger"
            title="Users unavailable"
            description={error instanceof Error ? error.message : "Unable to load user accounts."}
            action={<Button onClick={() => refetch()}>Retry</Button>}
            className="min-h-[45vh]"
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total accounts"
                value={managedUsers.length}
                description="Accounts available in the web console."
                icon={Users}
              />
              <MetricCard
                label="Privileged users"
                value={adminCount + operatorCount}
                description={`${adminCount} admin, ${operatorCount} operator`}
                icon={Shield}
                tone="success"
              />
              <MetricCard
                label="Viewers"
                value={viewerCount}
                description="Accounts restricted to read-oriented workflows."
                icon={Eye}
              />
              <MetricCard
                label="Reset required"
                value={resetCount}
                description="Accounts forced to change password on next login."
                icon={KeyRound}
                tone={resetCount > 0 ? "warning" : "success"}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <UserCreateCard
                form={form}
                isPending={createMutation.isPending}
                onSubmit={(data) => createMutation.mutate(data)}
              />
              <UsersTableCard
                users={managedUsers}
                isLoading={false}
                currentUserId={user.id}
                isDeleting={deleteMutation.isPending}
                onEdit={openEditDialog}
                onManageDomains={openDomainDialog}
                onDelete={setDeleteTarget}
              />
            </div>
          </>
        )}

        <EditUserDialog
          user={editTarget}
          role={editRole}
          password={editPassword}
          mustChangePassword={editMustChangePassword}
          isPending={updateMutation.isPending}
          onRoleChange={setEditRole}
          onPasswordChange={setEditPassword}
          onMustChangePasswordChange={setEditMustChangePassword}
          onClose={() => setEditTarget(null)}
          onSave={handleEditSave}
        />

        <DeleteUserDialog
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        />

        <UserDomainAccessDialog
          user={jailTarget}
          zoneIds={jailZoneIds}
          allZones={jailAllZones}
          isLoading={jailLoading || domainAccessMutation.isPending}
          onZoneIdsChange={setJailZoneIds}
          onClose={closeDomainDialog}
          onSave={() =>
            jailTarget && domainAccessMutation.mutate({ id: jailTarget.id, zoneIds: jailZoneIds })
          }
        />
      </div>
    </DashboardLayout>
  );
}
