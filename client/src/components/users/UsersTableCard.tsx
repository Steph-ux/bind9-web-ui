import { Globe, Loader2, Pencil, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ManagedUser } from "@/lib/api";

import { UserRoleBadge } from "./user-role-badge";

export function UsersTableCard({
  users,
  isLoading,
  currentUserId,
  isDeleting,
  onEdit,
  onManageDomains,
  onDelete,
}: {
  users: ManagedUser[] | undefined;
  isLoading: boolean;
  currentUserId?: string;
  isDeleting: boolean;
  onEdit: (user: ManagedUser) => void;
  onManageDomains: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
}) {
  return (
    <Card className="lg:col-span-8">
      <CardHeader className="border-b flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <CardTitle>Users</CardTitle>
        {users && <Badge variant="secondary" className="ml-auto">{users.length}</Badge>}
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
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : users?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                users?.map((managedUser) => (
                  <tr key={managedUser.id} className="border-b transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-2">
                        <span>{managedUser.username}</span>
                        {managedUser.mustChangePassword && (
                          <Badge variant="outline">Reset required</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UserRoleBadge role={managedUser.role} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(managedUser.createdAt).toLocaleDateString()}
                    </td>
                    <td className="flex justify-end gap-1 px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(managedUser)}
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {managedUser.role === "viewer" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onManageDomains(managedUser)}
                          title="Manage domain access"
                        >
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDelete(managedUser)}
                        disabled={managedUser.id === currentUserId || isDeleting}
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
  );
}
