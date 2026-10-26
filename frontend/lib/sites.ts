import api from "./api";
import type { Site, SitePayload } from "@/types/site";

export async function getSites(companyId?: string): Promise<Site[]> {
  const response = await api.get<Site[]>("/sites", {
    params: companyId ? { company_id: companyId } : undefined,
  });
  return response.data;
}

export async function createSite(
  payload: SitePayload,
  companyId?: string,
): Promise<Site> {
  const response = await api.post<Site>("/sites", payload, {
    params: companyId ? { company_id: companyId } : undefined,
  });
  return response.data;
}

export async function updateSite(
  siteId: string,
  payload: Partial<SitePayload>,
): Promise<Site> {
  const response = await api.patch<Site>(`/sites/${siteId}`, payload);
  return response.data;
}

export async function setSiteActive(site: Site, isActive: boolean): Promise<Site> {
  if (!isActive) {
    const response = await api.delete<Site>(`/sites/${site.id}`);
    return response.data;
  }
  return updateSite(site.id, { is_active: true } as Partial<SitePayload>);
}
