"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";

import { getCompanies } from "@/lib/companies";
import { getSites } from "@/lib/sites";
import { createManagedUser, getUsers, setManagedUserStatus } from "@/lib/users";
import { getToken, getUser } from "@/lib/auth";
import type { User, ManagedRole, ManagedUserCreate } from "@/types/auth";
import type { Company } from "@/types/company";
import type { Site } from "@/types/site";

const COMPANY_ROLES: ManagedRole[] = ["HR", "PAYROLL", "SUPERVISOR"];
const USER_PAGE_SIZE = 50;
const SUPER_ADMIN_ROLES: ManagedRole[] = [
  "COMPANY_ADMIN",
  "HR",
  "PAYROLL",
  "SUPERVISOR",
  "SUPER_ADMIN",
];

const blank = {
  username: "",
  email: "",
  full_name: "",
  password: "",
  role: "HR" as ManagedRole,
  site_id: "",
};

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blank);

  const loadUsers = useCallback(async (targetCompany: string, targetPage = 0) => {
    try {
      const result = await getUsers({
        company_id: targetCompany || undefined,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        is_active: activeFilter === "" ? undefined : activeFilter === "true",
        offset: targetPage * USER_PAGE_SIZE,
        limit: USER_PAGE_SIZE + 1,
      });
      setUsers(result.slice(0, USER_PAGE_SIZE));
      setPage(targetPage);
      setHasMore(result.length > USER_PAGE_SIZE);
      setError("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [activeFilter, roleFilter, search]);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    const user = getUser();
    if (!user || !["SUPER_ADMIN", "COMPANY_ADMIN"].includes(user.role)) {
      window.location.replace("/dashboard");
      return;
    }
    const superAdmin = user.role === "SUPER_ADMIN";
    let cancelled = false;
    void getCompanies()
      .then(async (companyList) => {
        if (cancelled) return;
        setIsSuperAdmin(superAdmin);
        setCanManage(true);
        setCompanies(companyList);
        const initialCompany = user.company_id ?? companyList[0]?.id ?? "";
        setCompanyId(initialCompany);
        const [userList, siteList] = await Promise.all([
          getUsers({ company_id: initialCompany || undefined, limit: USER_PAGE_SIZE + 1 }),
          initialCompany ? getSites(initialCompany) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setUsers(userList.slice(0, USER_PAGE_SIZE));
          setHasMore(userList.length > USER_PAGE_SIZE);
          setSites(siteList);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !normalized
        || [user.username, user.full_name, user.email]
          .some((value) => value.toLowerCase().includes(normalized));
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesStatus = activeFilter === ""
        || user.is_active === (activeFilter === "true");
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [activeFilter, roleFilter, search, users]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLoading(true);
    try {
      const siteList = nextCompanyId ? await getSites(nextCompanyId) : [];
      setSites(siteList);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setLoading(false);
      return;
    }
    await loadUsers(nextCompanyId, 0);
    setLoading(false);
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await loadUsers(companyId, 0);
  }

  async function movePage(nextPage: number) {
    setLoading(true);
    await loadUsers(companyId, nextPage);
  }

  async function refreshPage() {
    setLoading(true);
    await loadUsers(companyId, page);
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload: ManagedUserCreate = {
      username: form.username.trim(),
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      password: form.password,
      role: form.role,
      company_id: form.role === "SUPER_ADMIN" ? null : companyId,
      site_id: form.role === "SUPERVISOR" ? form.site_id : null,
    };
    try {
      await createManagedUser(payload);
      setFormOpen(false);
      setForm(blank);
      setLoading(true);
      await loadUsers(companyId, 0);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function toggleStatus(user: User) {
    setError("");
    try {
      const updated = await setManagedUserStatus(user.id, !user.is_active);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  const roles = isSuperAdmin ? SUPER_ADMIN_ROLES : COMPANY_ROLES;

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <button
          onClick={() => void refreshPage()}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400">
              <ShieldCheck size={14} /> Access control
            </div>
            <h1 className="text-2xl font-semibold text-white">User Management</h1>
            <p className="mt-2 text-sm text-slate-400">Manage organization accounts and role assignments.</p>
          </div>
          {canManage && (
            <button
              onClick={() => { setForm(blank); setFormOpen(true); }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
            >
              <Plus size={16} /> New User
            </button>
          )}
        </section>
        {isSuperAdmin && (
          <label className="block max-w-sm text-xs text-slate-400">
            Company
            <select
              value={companyId}
              onChange={(event) => void changeCompany(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white"
            >
              <option value="">All companies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">
            <CircleAlert size={17} /> {error}
          </div>
        )}
        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
          <form onSubmit={(event) => void applyFilters(event)} className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-medium text-white">Accounts</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-[#0b1016] px-3">
                <Search size={14} className="text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="h-9 bg-transparent text-xs text-white outline-none sm:w-48" />
              </div>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-xs text-white">
                <option value="">All roles</option>
                {["SUPER_ADMIN", "COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR", "EMPLOYEE"].map((role) => <option key={role}>{role}</option>)}
              </select>
              <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-xs text-white">
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <button type="submit" className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10">Apply filters</button>
            </div>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#0d131a] text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Site</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {loading ? (
                  <tr><td colSpan={5} className="py-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr>
                ) : visibleUsers.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-slate-500">No users found.</td></tr>
                ) : visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3"><div className="font-medium text-white">{user.full_name}</div><div className="mt-1 text-xs text-slate-500">{user.username} · {user.email}</div></td>
                    <td className="px-4 py-3 text-xs text-slate-300">{user.role}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{sites.find((site) => site.id === user.site_id)?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs"><span className={user.is_active ? "text-emerald-400" : "text-slate-500"}>{user.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => void toggleStatus(user)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs hover:border-cyan-400/40" aria-label={`${user.is_active ? "Deactivate" : "Activate"} ${user.username}`}>
                        {user.is_active ? <UserRoundX size={13} /> : <UserRoundCheck size={13} />}
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500">
            <span>{visibleUsers.length} users · page {page + 1}</span>
            <div className="flex gap-2">
              <button disabled={page === 0 || loading} onClick={() => void movePage(page - 1)} className="rounded border border-white/10 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button disabled={!hasMore || loading} onClick={() => void movePage(page + 1)} className="rounded border border-white/10 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </footer>
        </section>
      </div>
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={(event) => void createAccount(event)} className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5">
            <div className="flex items-center justify-between">
              <div><h2 className="font-semibold text-white">Create account</h2><p className="mt-1 text-xs text-slate-500">Use a unique username and a password with at least 12 characters.</p></div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {isSuperAdmin && (
              <label className="block text-xs text-slate-400">Company
                <select
                  required={form.role !== "SUPER_ADMIN"}
                  value={form.role === "SUPER_ADMIN" ? "" : companyId}
                  onChange={(event) => void changeCompany(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"
                >
                  <option value="" disabled={form.role !== "SUPER_ADMIN"}>No company (Super Admin only)</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400">Full name<input required minLength={2} maxLength={255} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-slate-400">Username<input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-slate-400">Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-slate-400">Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as ManagedRole, site_id: "" })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
              <label className="text-xs text-slate-400">Temporary password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
              {form.role === "SUPERVISOR" && <label className="text-xs text-slate-400">Assigned site<select required value={form.site_id} onChange={(event) => setForm({ ...form, site_id: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select a site</option>{sites.filter((site) => site.is_active).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button>
              <button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Create user</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
