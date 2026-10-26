"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BrainCircuit,
  Building2,
  CalendarDays,
  CircleAlert,
  Map,
  RefreshCw,
  Users,
} from "lucide-react";

import { getCompanies } from "@/lib/companies";
import { getToken, getUser } from "@/lib/auth";
import { getRegionalWorkforceReport } from "@/lib/regional-reports";
import { getSites } from "@/lib/sites";
import type { Company } from "@/types/company";
import type { User } from "@/types/auth";
import type {
  AdministrativeLevel,
  RegionalMetric,
  RegionalWorkforceReport,
} from "@/types/regional-report";
import type { Site } from "@/types/site";

const levels: { value: AdministrativeLevel; label: string }[] = [
  { value: "region", label: "Region / State" },
  { value: "district", label: "District" },
  { value: "township", label: "Township" },
  { value: "ward_village_tract", label: "Ward / Village tract" },
];

function todayLocal() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function monthStartLocal() {
  return `${todayLocal().slice(0, 7)}-01`;
}

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The report could not be loaded.";
}

function currencyLabel(metric: RegionalMetric) {
  if (metric.currency && metric.labor_cost !== null) {
    return `${metric.currency} ${metric.labor_cost.toLocaleString()}`;
  }
  if (metric.labor_cost_by_currency.length > 0) {
    return metric.labor_cost_by_currency
      .map((item) => `${item.currency} ${item.amount.toLocaleString()}`)
      .join(" · ");
  }
  return metric.payroll_data_available ? "Unavailable" : "No finalized payroll";
}

export default function RegionalWorkforcePage() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [report, setReport] = useState<RegionalWorkforceReport | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [level, setLevel] = useState<AdministrativeLevel>("region");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isSupervisor = user?.role === "SUPERVISOR";
  const selectedLevel = useMemo(
    () => levels.find((item) => item.value === level)?.label ?? "Region / State",
    [level],
  );

  const loadReport = useCallback(async (filters: {
    company: string;
    site: string;
    starts: string;
    ends: string;
    grouping: AdministrativeLevel;
  }) => {
    setLoading(true);
    setError("");
    try {
      const [nextReport, nextSites] = await Promise.all([
        getRegionalWorkforceReport({
          starts_on: filters.starts,
          ends_on: filters.ends,
          grouping_level: filters.grouping,
          ...(filters.company ? { company_id: filters.company } : {}),
          ...(filters.site ? { site_id: filters.site } : {}),
        }),
        getSites(filters.company || undefined),
      ]);
      setReport(nextReport);
      setSites(nextSites);
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
    const activeUser = getUser();
    const initialCompany = activeUser?.role === "SUPER_ADMIN" ? "" : activeUser?.company_id ?? "";
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setUser(activeUser);
      setCompanyId(initialCompany);
    });
    if (activeUser?.role === "SUPER_ADMIN") {
      void getCompanies().then((items) => {
        if (!cancelled) setCompanies(items);
      }).catch(() => {
        if (!cancelled) setError("Company scope options could not be loaded.");
      });
    }
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const initialStartsOn = monthStartLocal();
      const initialEndsOn = todayLocal();
      setStartsOn(initialStartsOn);
      setEndsOn(initialEndsOn);
      void loadReport({
        company: initialCompany,
        site: activeUser?.role === "SUPERVISOR" ? activeUser.site_id ?? "" : "",
        starts: initialStartsOn,
        ends: initialEndsOn,
        grouping: "region",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadReport]);

  const visibleSites = useMemo(
    () => isSupervisor
      ? sites.filter((site) => site.id === user?.site_id)
      : sites,
    [isSupervisor, sites, user?.site_id],
  );
  const totalEmployees = report?.regions.reduce(
    (sum, item) => sum + item.active_employee_count,
    0,
  ) ?? 0;
  const availableAttendance = report?.regions.filter(
    (item) => item.attendance_rate !== null && item.attendance_opportunity_count > 0,
  ) ?? [];
  const overallAttendance = availableAttendance.length > 0
    ? availableAttendance.reduce(
      (sum, item) => sum + (item.attendance_rate ?? 0) * item.attendance_opportunity_count,
      0,
    ) / availableAttendance.reduce((sum, item) => sum + item.attendance_opportunity_count, 0)
    : null;
  const regionRows = report?.regions ?? [];
  const maxEmployees = Math.max(1, ...regionRows.map((item) => item.active_employee_count));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadReport({
      company: companyId,
      site: siteId,
      starts: startsOn,
      ends: endsOn,
      grouping: level,
    });
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </Link>
        <button
          type="button"
          onClick={() => void loadReport({ company: companyId, site: siteId, starts: startsOn, ends: endsOn, grouping: level })}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400">
              <Map size={14} /> Workforce intelligence
            </div>
            <h1 className="text-2xl font-semibold text-white">Regional Workforce Heatmap</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Compare recorded workforce activity across site administrative areas. This metrics heatmap is not a geographic boundary map.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> Data-linked · No forecasts
          </div>
        </section>

        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#111820] p-4 sm:grid-cols-2 lg:grid-cols-5">
          {isSuperAdmin && (
            <label className="text-xs text-slate-400">
              Company scope
              <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setSiteId(""); }} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white">
                <option value="">All companies</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-400">
            Site
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={isSupervisor} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white disabled:opacity-60">
              {!isSupervisor && <option value="">All sites</option>}
              {visibleSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Group by
            <select value={level} onChange={(event) => setLevel(event.target.value as AdministrativeLevel)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white">
              {levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            From
            <input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white" />
          </label>
          <div className="flex items-end gap-3">
            <label className="min-w-0 flex-1 text-xs text-slate-400">
              Through
              <input required type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white" />
            </label>
            <button type="submit" disabled={loading} className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-semibold text-slate-950 disabled:opacity-50">
              <CalendarDays size={14} /> Apply
            </button>
          </div>
        </form>

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500"><Users size={14} /> Active employees</div>
            <div className="mt-3 text-2xl font-semibold text-white">{loading ? "…" : totalEmployees.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">Across {report?.sites.length ?? 0} scoped sites</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500"><CalendarDays size={14} /> Recorded attendance rate</div>
            <div className="mt-3 text-2xl font-semibold text-white">{overallAttendance === null ? "—" : `${overallAttendance.toFixed(1)}%`}</div>
            <div className="mt-1 text-xs text-slate-500">{report ? `${availableAttendance.length} ${selectedLevel.toLowerCase()} groups with records` : "Awaiting report data"}</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#111820] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500"><Building2 size={14} /> Comparison window</div>
            <div className="mt-3 text-sm font-medium text-white">{report?.comparison_starts_on ?? "—"} to {report?.comparison_ends_on ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">Equal-length immediately preceding period</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
          <div className="flex flex-col gap-2 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">{selectedLevel} workforce distribution</h2>
              <p className="mt-1 text-xs text-slate-500">Heat intensity represents active headcount. Missing attendance or finalized payroll is shown as unavailable, not zero.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Administrative metrics · not a geographic map</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="bg-[#0d131a] text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">Area / heat</th><th className="px-4 py-3">Sites</th><th className="px-4 py-3">Active employees</th><th className="px-4 py-3">Attendance records</th><th className="px-4 py-3">Attendance rate</th><th className="px-4 py-3">Overtime</th><th className="px-4 py-3">Finalized payroll gross</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {loading ? <tr><td colSpan={7} className="py-12 text-center text-slate-500">Loading regional metrics…</td></tr>
                  : regionRows.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-slate-500">No sites are available in this scope. Set site administrative areas to populate the heatmap.</td></tr>
                    : regionRows.map((item) => <tr key={item.key} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><div className="font-medium text-white">{item.name}</div><div className="mt-1 h-1.5 w-36 overflow-hidden rounded bg-white/[0.06]"><div className="h-full rounded bg-gradient-to-r from-cyan-500/50 to-cyan-300 transition-all duration-700" style={{ width: `${Math.max(item.active_employee_count ? 8 : 0, item.active_employee_count / maxEmployees * 100)}%` }} /></div><div className="mt-1 text-[10px] text-slate-600">{[item.hierarchy.region, item.hierarchy.district, item.hierarchy.township, item.hierarchy.ward_village_tract].filter(Boolean).join(" · ") || "Administrative area not set"}</div></td>
                      <td className="px-4 py-3 text-slate-300">{item.site_count}</td>
                      <td className="px-4 py-3 font-medium text-white">{item.active_employee_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{item.attendance_record_count === null ? "Unavailable" : item.attendance_record_count.toLocaleString()}</td>
                      <td className="px-4 py-3">{item.attendance_rate === null ? <span className="text-slate-500">Unavailable</span> : <span className={item.attendance_rate >= 90 ? "text-emerald-300" : item.attendance_rate >= 75 ? "text-amber-300" : "text-rose-300"}>{item.attendance_rate.toFixed(1)}%</span>}</td>
                      <td className="px-4 py-3 text-slate-300">{item.overtime_minutes === null ? "Unavailable" : `${item.overtime_minutes.toLocaleString()} min`}</td>
                      <td className="px-4 py-3 text-slate-300">{currencyLabel(item)}{item.cost_availability_reason && <div className="mt-1 text-[10px] text-amber-300">{item.cost_availability_reason}</div>}</td>
                    </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-cyan-400/15 bg-[#101820] p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><BrainCircuit size={18} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-white">AI Regional Insights</h2>
              <p className="mt-1 text-xs text-slate-400">Deterministic, analytics-derived comparisons from recorded attendance and locked/paid payroll. Not an external AI assessment or forecast.</p>
            </div>
            <span className="rounded-full border border-cyan-400/20 px-2.5 py-1 text-[9px] uppercase tracking-wider text-cyan-300">Not a forecast</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report?.insights.length ? report.insights.map((insight, index) => <article key={`${insight.entity_name}-${insight.metric}-${index}`} className="rounded-lg border border-white/[0.07] bg-[#0b1016] p-3">
              <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-white">{insight.title}</h3><span className="text-[9px] uppercase tracking-wider text-cyan-300">Analytics-derived</span></div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{insight.detail}</p>
              <p className="mt-2 text-[10px] text-slate-600">Compared with {insight.comparison_starts_on} – {insight.comparison_ends_on}</p>
            </article>) : <div className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-slate-500 md:col-span-2">
              {loading ? "Evaluating comparable data…" : "No comparable current and preceding-period attendance or finalized payroll data is available for an evidence-based insight."}
            </div>}
          </div>
        </section>
        <p className="text-[10px] leading-5 text-slate-600">Boundary map display is not available because approved, licensed administrative boundary GeoJSON is not configured. Metrics are grouped from site fields only; no boundaries or external geographic data are inferred.</p>
      </div>
    </main>
  );
}
