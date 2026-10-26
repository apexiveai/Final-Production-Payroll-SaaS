
import api from "./api";
import type { Company, CompanyCreate, CompanyUpdate } from "../types/company";

export async function getCompanies(): Promise<Company[]> {
  const response = await api.get<Company[]>("/companies");
  return response.data;
}

export async function createCompany(
  payload: CompanyCreate,
): Promise<Company> {
  const response = await api.post<Company>("/companies", payload);
  return response.data;
}

export async function updateCompany(
  id: string,
  payload: CompanyUpdate,
): Promise<Company> {
  const response = await api.patch<Company>(
    `/companies/${id}`,
    payload,
  );
  return response.data;
}

export async function deactivateCompany(
  id: string,
): Promise<Company> {
  const response = await api.delete<Company>(`/companies/${id}`);
  return response.data;
}

export async function activateCompany(id: string): Promise<Company> {
  const response = await api.patch<Company>(`/companies/${id}`, {
    is_active: true,
  });
  return response.data;
}
