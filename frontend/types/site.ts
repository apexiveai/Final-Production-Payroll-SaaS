export interface Site {
  id: string;
  company_id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  district: string | null;
  township: string | null;
  ward_village_tract: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SitePayload = Pick<Site, "name" | "code"> &
  Partial<
    Pick<
      Site,
      | "address"
      | "phone"
      | "email"
      | "region"
      | "district"
      | "township"
      | "ward_village_tract"
    >
  > & {
    is_active?: boolean;
  };
