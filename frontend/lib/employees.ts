import api from "./api";
import type { Employee, EmployeePayload } from "@/types/employee";

export async function getEmployees(
  params: { company_id?: string; search?: string; offset?: number; limit?: number } = {},
): Promise<Employee[]> {
  const response = await api.get<Employee[]>("/employees", { params });
  return response.data;
}

export async function createEmployee(payload: EmployeePayload): Promise<Employee> {
  const response = await api.post<Employee>("/employees", payload);
  return response.data;
}

export async function updateEmployee(
  id: string,
  payload: Partial<EmployeePayload>,
): Promise<Employee> {
  const response = await api.patch<Employee>(`/employees/${id}`, payload);
  return response.data;
}
