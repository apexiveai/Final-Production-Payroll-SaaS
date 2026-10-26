export type AdministrativeLevel =
  | "region"
  | "district"
  | "township"
  | "ward_village_tract";

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export interface RegionalMetric {
  key: string;
  name: string;
  level: string;
  hierarchy: Record<AdministrativeLevel, string | null>;
  site_ids: string[];
  site_count: number;
  active_employee_count: number;
  data_available: Record<string, boolean>;
  attendance_record_count: number | null;
  attendance_opportunity_count: number;
  attendance_data_available: boolean;
  attendance_rate: number | null;
  overtime_minutes: number | null;
  payroll_data_available: boolean;
  cost_availability_reason: string | null;
  labor_cost: number | null;
  overtime_cost: number | null;
  currency: string | null;
  labor_cost_by_currency: CurrencyAmount[];
  overtime_cost_by_currency: CurrencyAmount[];
}

export interface RegionalInsight {
  entity_name: string;
  metric: "attendance_rate" | "overtime_cost";
  title: string;
  detail: string;
  change: number;
  unit: string;
  currency: string | null;
  source: "analytics-derived";
  is_forecast: false;
  comparison_starts_on: string;
  comparison_ends_on: string;
}

export interface RegionalWorkforceReport {
  starts_on: string;
  ends_on: string;
  comparison_starts_on: string;
  comparison_ends_on: string;
  grouping_level: AdministrativeLevel;
  selected_scope: {
    company_id: string | null;
    company_name: string | null;
    site_id: string | null;
  };
  regions: RegionalMetric[];
  sites: RegionalMetric[];
  insights: RegionalInsight[];
}
