import type { GaRole, Role } from "@prisma/client";

export interface RequestUser {
  id: number;
  username: string;
  fullname: string;
  role: Role;
  gaRole: GaRole;
  permissions: string[];
  authSource: "web" | "mobile";
}
