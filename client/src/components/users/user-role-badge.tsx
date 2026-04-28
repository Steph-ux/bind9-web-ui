import { Badge } from "@/components/ui/badge";

import type { UserRole } from "./user-types";

export function UserRoleBadge({ role }: { role: UserRole }) {
  if (role === "admin") {
    return <Badge variant="destructive">{role}</Badge>;
  }

  if (role === "operator") {
    return <Badge className="bg-green-600">{role}</Badge>;
  }

  return <Badge variant="secondary">{role}</Badge>;
}
