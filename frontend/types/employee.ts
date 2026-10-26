export interface Employee {
  id: string;
  company_id: string;
  site_id: string | null;
  department_id: string | null;
  position_id: string | null;
  user_id: string | null;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  hire_date: string;
  employment_status: "ACTIVE" | "INACTIVE" | "TERMINATED";
  contract_type: "PERMANENT" | "CONTRACT" | "TEMPORARY" | "CASUAL";
  currency: string;
}

export interface EmployeePayload {
  company_id?: string;
  site_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  employee_code: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  hire_date: string;
  employment_status: Employee["employment_status"];
  contract_type: Employee["contract_type"];
  base_salary: number;
  monthly_allowances: number;
  monthly_bonus: number;
  monthly_deductions: number;
  currency: string;
  payment_method?: string | null;
  bank_account_last4?: string | null;
}
