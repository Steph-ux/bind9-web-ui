import type { ManagedUser } from "@/lib/api";

export type UserRole = ManagedUser["role"];

export interface ZoneAccessOption {
  id: string;
  domain: string;
}
