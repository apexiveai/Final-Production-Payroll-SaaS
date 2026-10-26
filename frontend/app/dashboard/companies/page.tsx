
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { getToken, getUser } from "../../../lib/auth";
import {
  activateCompany,
  createCompany,
  deactivateCompany,
  getCompanies,
  updateCompany,
} from "../../../lib/companies";
import type { Company } from "../../../types/company";

const emptyForm = {
  name: "",
  code: "",
  email: "",
  phone: "",
  address: "",
};

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as {
      response?: { data?: { detail?: string } };
    }).response;

    if (response?.data?.detail) return response.data.detail;
  }

  return error instanceof Error
    ? error.message
    : "Request failed. Check the API connection and try again.";
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "offline">("checking");

  const loadCompanies = useCallback(async () => {
    try {
      const result = await getCompanies();
      setError("");
      setCompanies(result);
      setIsSuperAdmin(getUser()?.role === "SUPER_ADMIN");
      setApiStatus("connected");
    } catch (err) {
      setApiStatus("offline");
      setError(errorMessage(err));
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

    void getCompanies()
      .then((result) => {
        if (cancelled) return;
        setCompanies(result);
        setIsSuperAdmin(getUser()?.role === "SUPER_ADMIN");
        setApiStatus("connected");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setApiStatus("offline");
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCompanies = companies.filter((company) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [
      company.name,
      company.code,
      company.email ?? "",
      company.phone ?? "",
      company.address ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function startEdit(company: Company) {
    setEditing(company);
    setForm({
      name: company.name,
      code: company.code,
      email: company.email ?? "",
      phone: company.phone ?? "",
      address: company.address ?? "",
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };

    try {
      if (editing) {
        await updateCompany(editing.id, payload);
        setSuccess("Company information updated.");
      } else {
        await createCompany(payload);
        setSuccess("Company created successfully.");
      }

      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      await loadCompanies();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(company: Company) {
    if (!window.confirm(`Deactivate "${company.name}"? Users will lose access while it is inactive.`)) return;

    setError("");
    setSuccess("");

    try {
      await deactivateCompany(company.id);
      setSuccess(`${company.name} has been deactivated.`);
      await loadCompanies();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleActivate(company: Company) {
    setError("");
    setSuccess("");

    try {
      await activateCompany(company.id);
      setSuccess(`${company.name} has been activated.`);
      await loadCompanies();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const activeCount = companies.filter((company) => company.is_active).length;

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c]/95 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft size={15} />
            Dashboard
          </Link>
          <ChevronRight size={13} className="text-slate-600" />
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 size={16} className="text-cyan-400" />
            Company Management
          </div>
        </div>

        <div className="hidden items-center gap-2 text-xs sm:flex">
          <span className={`h-2 w-2 rounded-full ${
            apiStatus === "connected" ? "bg-emerald-400" :
            apiStatus === "offline" ? "bg-rose-400" : "animate-pulse bg-amber-400"
          }`} />
          <span className="text-slate-400">
            API {apiStatus === "connected" ? "CONNECTED" : apiStatus === "offline" ? "OFFLINE" : "CHECKING"}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
              <Activity size={13} />
              Workforce / Organization
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Company Management
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Manage organization profiles and company-level access for the workforce platform.
            </p>
          </div>

          {isSuperAdmin && (
            <button
              onClick={startCreate}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:bg-cyan-300"
            >
              <Plus size={16} />
              New Company
            </button>
          )}
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-200">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Request could not be completed</p>
              <p className="mt-1 break-words text-rose-200/80">{error}</p>
            </div>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div role="status" className="flex items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-200">
            <Check size={17} />
            <span>{success}</span>
            <button onClick={() => setSuccess("")} className="ml-auto" aria-label="Dismiss success">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total Companies</span>
              <Building2 size={17} className="text-cyan-400" />
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-white">
              {loading ? "—" : companies.length}
            </div>
            <p className="mt-2 text-xs text-slate-500">Records returned by the API</p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Active Companies</span>
              <ShieldCheck size={17} className="text-emerald-400" />
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-white">
              {loading ? "—" : activeCount}
            </div>
            <p className="mt-2 text-xs text-slate-500">Currently marked active</p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Connection</span>
              <Activity size={17} className="text-violet-400" />
            </div>
            <div className="mt-4 text-xl font-semibold text-white">
              {apiStatus === "connected" ? "Operational" :
                apiStatus === "offline" ? "Unavailable" : "Checking…"}
            </div>
            <p className="mt-2 text-xs text-slate-500">Authenticated API requests</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820] shadow-[0_15px_45px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Organization Registry</h2>
              <p className="mt-1 text-xs text-slate-500">Company records stored in PostgreSQL</p>
            </div>

            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#0b1016] px-3 sm:w-64">
                <Search size={15} className="shrink-0 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search companies..."
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-600"
                />
              </div>
              <button
                onClick={() => {
                  setLoading(true);
                  void loadCompanies();
                }}
                disabled={loading}
                title="Refresh companies"
                className="rounded-lg border border-white/[0.09] px-3 text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              >
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#0d131a] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.055]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500">
                      <LoaderCircle size={20} className="mx-auto mb-3 animate-spin text-cyan-400" />
                      Loading company records…
                    </td>
                  </tr>
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <Building2 size={26} className="mx-auto mb-3 text-slate-600" />
                      <p className="text-sm text-slate-300">
                        {search ? "No matching companies found" : "No company records yet"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {search ? "Try a different search term." : "Create a company to get started."}
                      </p>
                    </td>
                  </tr>
                ) : filteredCompanies.map((company) => (
                  <tr key={company.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300">
                          <Building2 size={17} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-100">{company.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{company.email || "No email supplied"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 font-mono text-xs text-slate-300">
                        {company.code}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {company.phone || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                        company.is_active
                          ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
                          : "border-slate-500/20 bg-slate-500/[0.08] text-slate-400"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${company.is_active ? "bg-emerald-400" : "bg-slate-500"}`} />
                        {company.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {isSuperAdmin && (
                          <>
                            <button
                              onClick={() => startEdit(company)}
                              className="rounded-md border border-white/[0.09] px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-200"
                            >
                              Edit
                            </button>
                            {company.is_active && (
                              <button
                                onClick={() => void handleDeactivate(company)}
                                className="rounded-md border border-rose-400/15 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/[0.08]"
                              >
                                Deactivate
                              </button>
                            )}
                            {!company.is_active && (
                              <button
                                onClick={() => void handleActivate(company)}
                                className="rounded-md border border-emerald-400/15 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-400/[0.08]"
                              >
                                Activate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3 text-xs text-slate-500">
            <span>{loading ? "Loading…" : `${filteredCompanies.length} of ${companies.length} companies`}</span>
            <span className="font-mono">API /companies</span>
          </footer>
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <section className="my-auto w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#111820] shadow-2xl shadow-black/50">
            <header className="flex items-center justify-between border-b border-white/[0.08] p-5">
              <div>
                <h2 className="font-semibold text-white">
                  {editing ? "Edit Company" : "Create Company"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Organization profile · PostgreSQL
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                aria-label="Close form"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Company name *</label>
                <input
                  required
                  minLength={2}
                  maxLength={255}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. ApexiveAI Company Ltd"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#0b1016] px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Company code *</label>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  pattern="[A-Za-z0-9_-]+"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  placeholder="e.g. APEXIVE"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#0b1016] px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-400/50"
                />
                <p className="mt-1 text-[11px] text-slate-600">Letters, numbers, hyphens and underscores only.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="admin@company.com"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0b1016] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Phone</label>
                  <input
                    value={form.phone}
                    maxLength={50}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="+95 ..."
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0b1016] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Address</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                  placeholder="Registered office address..."
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-[#0b1016] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs text-rose-200">
                  {error}
                </p>
              )}

              <footer className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                  {saving ? "Saving…" : editing ? "Save changes" : "Create company"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
