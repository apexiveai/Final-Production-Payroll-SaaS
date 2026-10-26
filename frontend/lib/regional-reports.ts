import api from "./api";
import type {
  AdministrativeLevel,
  RegionalWorkforceReport,
} from "@/types/regional-report";

export interface RegionalReportFilters {
  starts_on: string;
  ends_on: string;
  grouping_level: AdministrativeLevel;
  company_id?: string;
  site_id?: string;
}

export async function getRegionalWorkforceReport(
  filters: RegionalReportFilters,
): Promise<RegionalWorkforceReport> {
  const response = await api.get<RegionalWorkforceReport>(
    "/reports/regional-workforce",
    { params: filters },
  );
  return response.data;
}
