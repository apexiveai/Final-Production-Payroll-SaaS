"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CircleAlert, LoaderCircle, MapPin, Plus, RefreshCw, Search, X } from "lucide-react";

import { getCompanies } from "@/lib/companies";
import { getToken, getUser } from "@/lib/auth";
import { createSite, getSites, setSiteActive, updateSite } from "@/lib/sites";
import type { Company } from "@/types/company";
import type { Site, SitePayload } from "@/types/site";

const emptyForm = {
  name: "",
  code: "",
  address: "",
  phone: "",
  email: "",
  region: "",
  district: "",
  township: "",
  ward_village_tract: "",
};

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadSites = useCallback(async (selectedCompanyId: string) => {
    try {
      const result = await getSites(selectedCompanyId || undefined);
      setSites(result);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const user = getUser();
    const superAdmin = user?.role === "SUPER_ADMIN";
    void getCompanies()
      .then((result) => {
        if (cancelled) return;
        setIsSuperAdmin(superAdmin);
        setCompanies(result);
        const initialCompany = user?.company_id ?? result[0]?.id ?? "";
        setCompanyId(initialCompany);
        return getSites(initialCompany || undefined);
      })
      .then((result) => {
        if (cancelled || !result) return;
        setSites(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(messageFor(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) =>
      [site.name, site.code, site.address ?? "", site.phone ?? "", site.region ?? "", site.district ?? "", site.township ?? "", site.ward_village_tract ?? ""]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, sites]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload: SitePayload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      region: form.region.trim() || null,
      district: form.district.trim() || null,
      township: form.township.trim() || null,
      ward_village_tract: form.ward_village_tract.trim() || null,
    };
    try {
      if (editing) await updateSite(editing.id, payload);
      else await createSite(payload, isSuperAdmin ? companyId : undefined);
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadSites(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  function startEdit(site: Site) {
    setEditing(site);
    setForm({
      name: site.name,
      code: site.code,
      address: site.address ?? "",
      phone: site.phone ?? "",
      email: site.email ?? "",
      region: site.region ?? "",
      district: site.district ?? "",
      township: site.township ?? "",
      ward_village_tract: site.ward_village_tract ?? "",
    });
    setFormOpen(true);
  }

  async function toggleSite(site: Site) {
    if (site.is_active && !window.confirm(`Deactivate "${site.name}"?`)) return;
    try {
      await setSiteActive(site, !site.is_active);
      await loadSites(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <button onClick={() => { setLoading(true); void loadSites(companyId); }} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <RefreshCw size={14} /> Refresh
        </button>
      </header>
      <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400"><MapPin size={13} /> Organization</div>
            <h1 className="text-2xl font-semibold text-white">Site Management</h1>
            <p className="mt-2 text-sm text-slate-400">Manage work locations within each company.</p>
          </div>
          <button onClick={() => { setEditing(null); setForm(emptyForm); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={!companyId}>
            <Plus size={16} /> New Site
          </button>
        </section>
        {isSuperAdmin && (
          <label className="block max-w-sm text-xs text-slate-400">
            Company
            <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setLoading(true); void loadSites(event.target.value); }} className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white">
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        )}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}
        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-white"><Building2 size={16} className="text-cyan-400" /> Sites</div>
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-[#0b1016] px-3">
              <Search size={14} className="text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sites" className="h-9 w-full bg-transparent text-xs text-white outline-none sm:w-56" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-[#0d131a] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Site</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {loading ? <tr><td colSpan={5} className="py-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr>
                  : filteredSites.length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-slate-500">No sites found.</td></tr>
                    : filteredSites.map((site) => <tr key={site.id}>
                      <td className="px-4 py-3"><div className="font-medium text-white">{site.name}</div><div className="mt-1 text-xs text-slate-500">{site.phone || site.email || "No contact"}</div></td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{site.code}</td>
                      <td className="px-4 py-3 text-xs text-slate-400"><div>{site.address || "—"}</div><div className="mt-1 text-[10px] text-slate-500">{[site.region, site.district, site.township, site.ward_village_tract].filter(Boolean).join(" · ") || "Administrative area not set"}</div></td>
                      <td className="px-4 py-3 text-xs">{site.is_active ? "Active" : "Inactive"}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => startEdit(site)} className="rounded border border-white/10 px-2.5 py-1 text-xs hover:border-cyan-400/40">Edit</button><button onClick={() => void toggleSite(site)} className="rounded border border-white/10 px-2.5 py-1 text-xs hover:border-rose-400/40">{site.is_active ? "Deactivate" : "Activate"}</button></div></td>
                    </tr>)}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500">{filteredSites.length} sites</footer>
        </section>
      </div>
      {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
        <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-white">{editing ? "Edit site" : "Create site"}</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button></div>
          {isSuperAdmin && !editing && <label className="block text-xs text-slate-400">Company<select required value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Site name<input required minLength={2} maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Site code<input required minLength={2} maxLength={100} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Address<input maxLength={500} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Phone<input maxLength={50} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400 sm:col-span-2">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Region / State<input maxLength={100} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">District<input maxLength={100} value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Township<input maxLength={100} value={form.township} onChange={(event) => setForm({ ...form, township: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">Ward / Village tract<input maxLength={150} value={form.ward_village_tract} onChange={(event) => setForm({ ...form, ward_village_tract: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950">Save site</button></div>
        </form>
      </div>}
    </main>
  );
}
