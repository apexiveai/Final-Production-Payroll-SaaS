"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Download, LoaderCircle, LockKeyhole, Play, RefreshCw, Wallet } from "lucide-react";

import api from "@/lib/api";
import { getCompanies } from "@/lib/companies";
import { getToken, getUser } from "@/lib/auth";
import type { Company } from "@/types/company";

type PayrollRun = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: string;
};
type PayrollItem = {
  id: string;
  employee_id: string;
  base_pay: string;
  overtime_pay: string;
  allowances: string;
  bonus_pay: string;
  deductions: string;
  unpaid_leave_deduction: string;
  gross_pay: string;
  net_pay: string;
  payment_status: string;
};
type Payslip = Omit<PayrollItem, "id" | "employee_id" | "payment_status"> & {
  run_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: string;
};

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function money(value: string, currency: string): string {
  return `${currency} ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PayrollPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [items, setItems] = useState<Record<string, PayrollItem[]>>({});
  const [isEmployee, setIsEmployee] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canRun, setCanRun] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [currency, setCurrency] = useState("MMK");
  const [creating, setCreating] = useState(false);

  async function loadRuns(targetCompanyId: string) {
    setLoading(true);
    try {
      const response = await api.get<PayrollRun[]>("/payroll/runs", {
        params: targetCompanyId ? { company_id: targetCompanyId, limit: 50 } : { limit: 50 },
      });
      setRuns(response.data);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const user = getUser();
    const employee = user?.role === "EMPLOYEE";
    if (employee) {
      void api.get<Payslip[]>("/payroll/payslips")
        .then((response) => {
          if (cancelled) return;
          setIsEmployee(true);
          setCanRun(false);
          setCanApprove(false);
          setPayslips(response.data);
        })
        .catch((requestError: unknown) => { if (!cancelled) setError(messageFor(requestError)); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    void getCompanies()
      .then(async (result) => {
        if (cancelled) return;
        setIsEmployee(false);
        setIsSuperAdmin(user?.role === "SUPER_ADMIN");
        setCanRun(["SUPER_ADMIN", "COMPANY_ADMIN", "PAYROLL"].includes(user?.role ?? ""));
        setCanApprove(["SUPER_ADMIN", "COMPANY_ADMIN"].includes(user?.role ?? ""));
        setCompanies(result);
        const initialCompany = user?.company_id ?? result[0]?.id ?? "";
        setCompanyId(initialCompany);
        if (!initialCompany) return;
        const response = await api.get<PayrollRun[]>("/payroll/runs", {
          params: { company_id: initialCompany, limit: 50 },
        });
        if (!cancelled) setRuns(response.data);
      })
      .catch((requestError: unknown) => { if (!cancelled) setError(messageFor(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      await api.post("/payroll/runs", {
        ...(isSuperAdmin ? { company_id: companyId } : {}),
        period_start: periodStart,
        period_end: periodEnd,
        currency: currency.toUpperCase(),
      });
      await loadRuns(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function transition(runId: string, status: "REVIEWED" | "APPROVED" | "LOCKED") {
    try {
      await api.post(`/payroll/runs/${runId}/transition`, null, { params: { target_status: status } });
      await loadRuns(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function markPaid(runId: string) {
    try {
      await api.post(`/payroll/runs/${runId}/payments`);
      await loadRuns(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function loadItems(run: PayrollRun) {
    try {
      const response = await api.get<PayrollItem[]>(`/payroll/runs/${run.id}/items`);
      setItems((previous) => ({ ...previous, [run.id]: response.data }));
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function reverseRun(run: PayrollRun) {
    const reason = window.prompt("Reason for payroll reversal (minimum 5 characters):");
    if (!reason) return;
    try {
      await api.post(`/payroll/runs/${run.id}/reverse`, null, { params: { reason } });
      await loadRuns(companyId);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function exportCsv(runId: string) {
    try {
      const response = await api.get(`/payroll/runs/${runId}/export.csv`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payroll-${runId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function exportAccountingCsv(runId: string) {
    try {
      const response = await api.get(`/payroll/runs/${runId}/export.accounting.csv`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payroll-accounting-${runId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function exportXlsx(runId: string) {
    try {
      const response = await api.get(`/payroll/runs/${runId}/export.xlsx`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payroll-${runId}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4"><Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={15} /> Dashboard</Link><button onClick={() => isEmployee ? window.location.reload() : void loadRuns(companyId)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RefreshCw size={14} /> Refresh</button></header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400"><Wallet size={14} /> Finance</div><h1 className="text-2xl font-semibold text-white">{isEmployee ? "My payslips" : "Payroll Management"}</h1><p className="mt-2 text-sm text-slate-400">Draft, review, approve, lock and settle payroll with recorded transitions.</p></section>
        {isSuperAdmin && !isEmployee && <label className="block max-w-sm text-xs text-slate-400">Company<select value={companyId} onChange={(event) => { setCompanyId(event.target.value); void loadRuns(event.target.value); }} className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}
        {canRun && <form onSubmit={createDraft} className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#111820] p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <label className="text-xs text-slate-400">Period start<input required type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Period end<input required type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-400">Currency<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
          <p className="text-[10px] leading-4 text-slate-500">Uses configured salary components and attendance. OT defaults to 1.5×.</p>
          <button type="submit" disabled={creating || !companyId} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50"><Play size={13} />{creating ? "Calculating…" : "Create draft"}</button>
        </form>}
        {isEmployee ? <section className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#111820]"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#0d131a] text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Period</th><th className="px-4 py-3">Base + OT</th><th className="px-4 py-3">Allowances / bonus</th><th className="px-4 py-3">Deductions</th><th className="px-4 py-3">Net pay</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-white/[0.05]">{loading ? <tr><td colSpan={6} className="py-10 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : payslips.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">No approved payslips available.</td></tr> : payslips.map((slip) => <tr key={slip.run_id}><td className="px-4 py-3 text-xs text-white">{slip.period_start} — {slip.period_end}</td><td className="px-4 py-3 text-xs">{money(slip.base_pay, slip.currency)}<div className="mt-1 text-slate-500">OT {money(slip.overtime_pay, slip.currency)}</div></td><td className="px-4 py-3 text-xs">{money(slip.allowances, slip.currency)} / {money(slip.bonus_pay, slip.currency)}</td><td className="px-4 py-3 text-xs text-rose-300">{money(String(Number(slip.deductions) + Number(slip.unpaid_leave_deduction)), slip.currency)}</td><td className="px-4 py-3 text-xs font-semibold text-emerald-300">{money(slip.net_pay, slip.currency)}</td><td className="px-4 py-3 text-xs">{slip.status}</td></tr>)}</tbody></table></section> : <section className="space-y-3">{loading ? <div className="p-10 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></div> : runs.length === 0 ? <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-8 text-center text-sm text-slate-500">No payroll runs found.</div> : runs.map((run) => <article key={run.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium text-white">{run.period_start} — {run.period_end}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{run.id}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px]">{run.status}</span><button onClick={() => void loadItems(run)} className="rounded border border-white/10 px-2.5 py-1 text-[10px]">Items</button>{canRun && run.status === "DRAFT" && <button onClick={() => void transition(run.id, "REVIEWED")} className="rounded border border-cyan-400/20 px-2.5 py-1 text-[10px] text-cyan-200">Submit for review</button>}{canApprove && run.status === "REVIEWED" && <button onClick={() => void transition(run.id, "APPROVED")} className="rounded border border-emerald-400/20 px-2.5 py-1 text-[10px] text-emerald-200">Approve</button>}{canApprove && run.status === "APPROVED" && <button onClick={() => void transition(run.id, "LOCKED")} className="flex items-center gap-1 rounded border border-amber-400/20 px-2.5 py-1 text-[10px] text-amber-200"><LockKeyhole size={11} /> Lock</button>}{canRun && run.status === "LOCKED" && <button onClick={() => void markPaid(run.id)} className="rounded border border-emerald-400/20 px-2.5 py-1 text-[10px] text-emerald-200">Mark paid</button>}{canApprove && ["APPROVED", "LOCKED", "PAID"].includes(run.status) && <button onClick={() => void reverseRun(run)} className="rounded border border-rose-400/20 px-2.5 py-1 text-[10px] text-rose-200">Reverse</button>}{canRun && ["LOCKED", "PAID"].includes(run.status) && <><button onClick={() => void exportCsv(run.id)} className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-[10px]"><Download size={11} /> CSV</button><button onClick={() => void exportAccountingCsv(run.id)} className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-[10px]"><Download size={11} /> Accounting</button><button onClick={() => void exportXlsx(run.id)} className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-[10px]"><Download size={11} /> Excel</button></>}</div></div>
          {items[run.id] && <div className="overflow-x-auto border-t border-white/[0.06]"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-[9px] uppercase text-slate-500"><tr><th className="px-4 py-2">Employee ID</th><th className="px-4 py-2">Gross</th><th className="px-4 py-2">Deductions</th><th className="px-4 py-2">Net</th><th className="px-4 py-2">Payment</th></tr></thead><tbody className="divide-y divide-white/[0.04]">{items[run.id].map((item) => <tr key={item.id}><td className="px-4 py-2 font-mono text-slate-400">{item.employee_id}</td><td className="px-4 py-2">{money(item.gross_pay, run.currency)}</td><td className="px-4 py-2">{money(String(Number(item.deductions) + Number(item.unpaid_leave_deduction)), run.currency)}</td><td className="px-4 py-2 font-medium text-emerald-300">{money(item.net_pay, run.currency)}</td><td className="px-4 py-2">{item.payment_status}</td></tr>)}</tbody></table></div>}
        </article>)}</section>}
      </div>
    </main>
  );
}
