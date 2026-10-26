
export interface Company {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyCreate {
  name: string;
  code: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export type CompanyUpdate = Partial<CompanyCreate>;
