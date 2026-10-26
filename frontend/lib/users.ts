import api from "@/lib/api";
import type { ManagedUserCreate, User } from "@/types/auth";

export type UserFilters = {
  company_id?: string;
  role?: string;
  is_active?: boolean;
  search?: string;
  offset?: number;
  limit?: number;
};

export async function getUsers(filters: UserFilters = {}): Promise<User[]> {
  const response = await api.get<User[]>("/users", { params: filters });
  return response.data;
}

export async function createManagedUser(payload: ManagedUserCreate): Promise<User> {
  const response = await api.post<User>("/users", payload);
  return response.data;
}

export async function setManagedUserStatus(
  userId: string,
  is_active: boolean,
): Promise<User> {
  const response = await api.patch<User>(`/users/${userId}/status`, { is_active });
  return response.data;
}
