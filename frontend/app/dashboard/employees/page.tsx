"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Download, FileText, KeyRound, LoaderCircle, Plus, RefreshCw, Search, Upload, Users, X } from "lucide-react";

import api from "@/lib/api";
import { createEmployee, getEmployees } from "@/lib/employees";
import { getSites } from "@/lib/sites";
import { getCompanies } from "@/lib/companies";
import { getToken, getUser } from "@/lib/auth";
import type { Company } from "@/types/company";
import type { Employee, EmployeePayload } from "@/types/employee";
import type { Site } from "@/types/site";

type NamedReference = { id: string; name?: string; title?: string };
type EmployeeDocument = {
  id: string;
  category: "PHOTO" | "DOCUMENT";
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

const blank = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  photo_url: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  hire_date: "",
  employment_status: "ACTIVE" as const,
  contract_type: "PERMANENT" as const,
  base_salary: "",
  monthly_allowances: "0",
  monthly_bonus: "0",
  monthly_deductions: "0",
  currency: "MMK",
  payment_method: "",
  bank_account_last4: "",
};

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [departments, setDepartments] = useState<NamedReference[]>([]);
  const [positions, setPositions] = useState<NamedReference[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [accountEmployee, setAccountEmployee] = useState<Employee | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [documentsEmployee, setDocumentsEmployee] = useState<Employee | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentCategory, setDocumentCategory] = useState<"PHOTO" | "DOCUMENT">("DOCUMENT");
  const [documentUploading, setDocumentUploading] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(blank);

  const loadEmployees = useCallback(async (targetCompanyId: string) => {
    try {
      const result = await getEmployees({
        company_id: targetCompanyId || undefined,
        search: query || undefined,
        limit: 100,
      });
      setEmployees(result);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const user = getUser();
    const superAdmin = user?.role === "SUPER_ADMIN";
    const canManageEmployees = ["SUPER_ADMIN", "COMPANY_ADMIN", "HR"].includes(user?.role ?? "");
    if (user?.role === "EMPLOYEE") {
      void getEmployees()
        .then((result) => {
          if (!cancelled) setEmployees(result);
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
    }
    void getCompanies()
      .then(async (result) => {
        if (cancelled) return;
        setCompanies(result);
        setIsSuperAdmin(superAdmin);
        setCanManage(canManageEmployees);
        const initialCompany = user?.company_id ?? result[0]?.id ?? "";
        setCompanyId(initialCompany);
        const [employeeResult, siteResult, departmentResult, positionResult] = await Promise.all([
          getEmployees({ company_id: initialCompany || undefined, limit: 100 }),
          getSites(initialCompany || undefined),
          api.get<NamedReference[]>("/departments", { params: initialCompany ? { company_id: initialCompany } : undefined }),
          api.get<NamedReference[]>("/positions", { params: initialCompany ? { company_id: initialCompany } : undefined }),
        ]);
        if (cancelled) return;
        setEmployees(employeeResult);
        setSites(siteResult);
        setDepartments(departmentResult.data);
        setPositions(positionResult.data);
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

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return employees;
    return employees.filter((employee) =>
      [employee.full_name, employee.employee_code, employee.email ?? ""]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [employees, query]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLoading(true);
    try {
      const [employeeResult, siteResult, departmentResult, positionResult] = await Promise.all([
        getEmployees({ company_id: nextCompanyId, limit: 100 }),
        getSites(nextCompanyId),
        api.get<NamedReference[]>("/departments", { params: { company_id: nextCompanyId } }),
        api.get<NamedReference[]>("/positions", { params: { company_id: nextCompanyId } }),
      ]);
      setEmployees(employeeResult);
      setSites(siteResult);
      setDepartments(departmentResult.data);
      setPositions(positionResult.data);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload: EmployeePayload = {
      employee_code: form.employee_code.trim().toUpperCase(),
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      photo_url: form.photo_url.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      hire_date: form.hire_date,
      employment_status: form.employment_status,
      contract_type: form.contract_type,
      base_salary: Number(form.base_salary),
      monthly_allowances: Number(form.monthly_allowances),
      monthly_bonus: Number(form.monthly_bonus),
      monthly_deductions: Number(form.monthly_deductions),
      currency: form.currency.toUpperCase(),
      payment_method: form.payment_method || null,
      bank_account_last4: form.bank_account_last4 || null,
      site_id: String(data.get("site_id") || "") || null,
      department_id: String(data.get("department_id") || "") || null,
      position_id: String(data.get("position_id") || "") || null,
      ...(isSuperAdmin ? { company_id: companyId } : {}),
    };
    try {
      await createEmployee(payload);
      setFormOpen(false);
      setForm(blank);
      setLoading(true);
      await loadEmployees(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function provisionAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountEmployee) return;
    setError("");
    try {
      await api.post(`/employees/${accountEmployee.id}/account`, {
        username: accountUsername.trim(),
        password: accountPassword,
      });
      setAccountEmployee(null);
      setAccountUsername("");
      setAccountPassword("");
      setLoading(true);
      await loadEmployees(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function openDocuments(employee: Employee) {
    setDocumentsEmployee(employee);
    setDocuments([]);
    setDocumentsLoading(true);
    setError("");
    try {
      const response = await api.get<EmployeeDocument[]>(`/employees/${employee.id}/documents`);
      setDocuments(response.data);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentsEmployee) return;
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    formData.set("category", documentCategory);
    setDocumentUploading(true);
    setError("");
    try {
      await api.post(`/employees/${documentsEmployee.id}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const response = await api.get<EmployeeDocument[]>(`/employees/${documentsEmployee.id}/documents`);
      setDocuments(response.data);
      formElement.reset();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setDocumentUploading(false);
    }
  }

  async function downloadDocument(document: EmployeeDocument) {
    if (!documentsEmployee) return;
    try {
      const response = await api.get<{ url: string }>(
        `/employees/${documentsEmployee.id}/documents/${document.id}/download`,
      );
      window.location.assign(response.data.url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function exportEmployees() {
    setError("");
    try {
      const response = await api.get<Blob>("/employees/export.csv", {
        params: isSuperAdmin ? { company_id: companyId } : undefined,
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `employees-${companyId || "company"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function importEmployees(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setError("");
    setImportNotice("");
    try {
      const response = await api.post<{ imported: number }>("/employees/import.csv", formData, {
        params: isSuperAdmin ? { company_id: companyId } : undefined,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportNotice(`${response.data.imported} employee profiles imported.`);
      setLoading(true);
      await loadEmployees(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      inputElement.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={15} /> Dashboard</Link>
        <button onClick={() => { setLoading(true); void loadEmployees(companyId); }} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RefreshCw size={14} /> Refresh</button>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400"><Users size={14} /> Workforce</div><h1 className="text-2xl font-semibold text-white">Employee Management</h1><p className="mt-2 text-sm text-slate-400">Profiles, employment data, salary structure and contact details.</p></div>
          {canManage && <div className="flex flex-wrap gap-2"><button onClick={() => void exportEmployees()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-cyan-400/40"><Download size={15} /> Export CSV</button><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-cyan-400/40"><Upload size={15} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importEmployees(event)} className="sr-only" /></label><button onClick={() => { setForm(blank); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={16} /> New Employee</button></div>}
        </section>
        {isSuperAdmin && <label className="block max-w-sm text-xs text-slate-400">Company<select value={companyId} onChange={(event) => void changeCompany(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        {importNotice && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">{importNotice}</p>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}
        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-sm font-medium text-white">Employee Registry</h2><div className="flex items-center gap-2 rounded-lg border border-white/[0.09] bg-[#0b1016] px-3"><Search size={14} className="text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or name" className="h-9 w-full bg-transparent text-xs text-white outline-none sm:w-56" /></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#0d131a] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Site</th><th className="px-4 py-3">Hire date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.05]">
            {loading ? <tr><td colSpan={6} className="py-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : filteredEmployees.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-slate-500">No employees found.</td></tr> : filteredEmployees.map((employee) => <tr key={employee.id}><td className="px-4 py-3"><div className="font-medium text-white">{employee.full_name}</div><div className="mt-1 text-xs text-slate-500">{employee.email || employee.phone || "No contact"}</div></td><td className="px-4 py-3 font-mono text-xs text-slate-300">{employee.employee_code}</td><td className="px-4 py-3 text-xs text-slate-400">{sites.find((site) => site.id === employee.site_id)?.name ?? "—"}</td><td className="px-4 py-3 text-xs text-slate-400">{employee.hire_date}</td><td className="px-4 py-3 text-xs">{employee.employment_status}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{canManage && !employee.user_id && employee.email && <button onClick={() => { setAccountEmployee(employee); setAccountUsername(employee.employee_code.toLowerCase()); }} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs hover:border-cyan-400/40"><KeyRound size={12} /> Create login</button>}<button onClick={() => void openDocuments(employee)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs hover:border-cyan-400/40"><FileText size={12} /> Files</button></div></td></tr>)}
          </tbody></table></div>
          <footer className="border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500">{filteredEmployees.length} employees · showing up to 100</footer>
        </section>
      </div>
      {formOpen && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"><form onSubmit={submit} className="my-auto w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">New employee profile</h2><p className="mt-1 text-xs text-slate-500">Bank account number is not stored; only its last four digits may be recorded.</p></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button></div>
        {isSuperAdmin && <label className="block text-xs text-slate-400">Company<select required value={companyId} onChange={(event) => void changeCompany(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-slate-400">Employee code<input required minLength={1} maxLength={100} value={form.employee_code} onChange={(event) => setForm({ ...form, employee_code: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Full name<input required minLength={2} maxLength={255} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Hire date<input required type="date" value={form.hire_date} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Photo URL<input type="url" value={form.photo_url} onChange={(event) => setForm({ ...form, photo_url: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Site<select name="site_id" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Unassigned</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label className="text-xs text-slate-400">Department<select name="department_id" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Unassigned</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-xs text-slate-400">Position<select name="position_id" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Unassigned</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label className="text-xs text-slate-400">Emergency contact<input value={form.emergency_contact_name} onChange={(event) => setForm({ ...form, emergency_contact_name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Emergency phone<input value={form.emergency_contact_phone} onChange={(event) => setForm({ ...form, emergency_contact_phone: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Employment status<select value={form.employment_status} onChange={(event) => setForm({ ...form, employment_status: event.target.value as typeof form.employment_status })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option>ACTIVE</option><option>INACTIVE</option><option>TERMINATED</option></select></label>
          <label className="text-xs text-slate-400">Contract type<select value={form.contract_type} onChange={(event) => setForm({ ...form, contract_type: event.target.value as typeof form.contract_type })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option>PERMANENT</option><option>CONTRACT</option><option>TEMPORARY</option><option>CASUAL</option></select></label>
          <label className="text-xs text-slate-400">Base monthly salary<input required type="number" min="0" step="0.01" value={form.base_salary} onChange={(event) => setForm({ ...form, base_salary: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Monthly allowances<input type="number" min="0" step="0.01" value={form.monthly_allowances} onChange={(event) => setForm({ ...form, monthly_allowances: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Monthly bonus<input type="number" min="0" step="0.01" value={form.monthly_bonus} onChange={(event) => setForm({ ...form, monthly_bonus: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Monthly deductions<input type="number" min="0" step="0.01" value={form.monthly_deductions} onChange={(event) => setForm({ ...form, monthly_deductions: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Currency<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Payment method<input value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Bank account last 4 digits<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={form.bank_account_last4} onChange={(event) => setForm({ ...form, bank_account_last4: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950">Save employee</button></div>
      </form></div>}
      {accountEmployee && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={provisionAccount} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Create employee login</h2><p className="mt-1 text-xs text-slate-500">{accountEmployee.full_name} · {accountEmployee.email}</p></div><button type="button" onClick={() => setAccountEmployee(null)} aria-label="Close"><X size={18} /></button></div>
        <label className="block text-xs text-slate-400">Username<input required minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" value={accountUsername} onChange={(event) => setAccountUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
        <label className="block text-xs text-slate-400">Temporary password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /><span className="mt-1 block text-[11px] text-slate-600">Share the initial password securely; the employee should change it after signing in.</span></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setAccountEmployee(null)} className="rounded-lg border border-white/10 px-4 py-2 text-xs">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950">Create account</button></div>
      </form></div>}
      {documentsEmployee && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="employee-files-title" className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5">
        <div className="flex items-start justify-between"><div><h2 id="employee-files-title" className="font-semibold text-white">Employee files</h2><p className="mt-1 text-xs text-slate-400">{documentsEmployee.full_name} · encrypted storage · 10 MB maximum</p></div><button onClick={() => setDocumentsEmployee(null)} aria-label="Close files"><X size={18} /></button></div>
        <form onSubmit={uploadDocument} className="grid gap-3 rounded-lg border border-white/[0.08] bg-[#0b1016] p-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2"><select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value as "PHOTO" | "DOCUMENT")} className="w-full rounded border border-white/10 bg-[#111820] px-2 py-2 text-xs text-white"><option value="DOCUMENT">Document</option><option value="PHOTO">Photo</option></select><input required name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-white" /></div>
          <button disabled={documentUploading} className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60"><Upload size={14} />{documentUploading ? "Uploading…" : "Upload"}</button>
        </form>
        <p className="text-[11px] text-slate-500">Only PDF, JPEG, and PNG files are accepted. Files are encrypted and expire according to the approved retention policy.</p>
        {documentsLoading ? <LoaderCircle className="mx-auto animate-spin text-slate-500" /> : documents.length === 0 ? <p className="rounded-lg border border-white/[0.06] p-4 text-center text-xs text-slate-500">No files uploaded.</p> : <ul className="divide-y divide-white/[0.06]">{documents.map((document) => <li key={document.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm text-white">{document.original_filename}</p><p className="mt-1 text-xs text-slate-500">{document.category} · {(document.size_bytes / 1024).toFixed(0)} KB · {new Date(document.created_at).toLocaleDateString()}</p></div><button onClick={() => void downloadDocument(document)} className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-slate-300 hover:border-cyan-400/40"><Download size={13} /> Download</button></li>)}</ul>}
      </section></div>}
    </main>
  );
}
