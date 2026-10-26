export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  company_id: string | null;
  site_id?: string | null;
  is_active: boolean;
}

export type ManagedRole =
  | "SUPER_ADMIN"
  | "COMPANY_ADMIN"
  | "HR"
  | "PAYROLL"
  | "SUPERVISOR";

export interface ManagedUserCreate {
  company_id?: string | null;
  site_id?: string | null;
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: ManagedRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}