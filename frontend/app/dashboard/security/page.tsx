"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, KeyRound, ShieldCheck } from "lucide-react";

import api from "@/lib/api";
import { clearAuth, getToken } from "@/lib/auth";

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function SecurityPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a new password different from the current password.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      clearAuth();
      router.replace("/login?password=changed");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function revokeSessions() {
    setError("");
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/logout");
      clearAuth();
      router.replace("/login");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft size={15} /> Dashboard
        </Link>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 p-5 md:p-8">
        <section>
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400">
            <ShieldCheck size={14} /> Account security
          </div>
          <h1 className="text-2xl font-semibold text-white">Security settings</h1>
          <p className="mt-2 text-sm text-slate-400">Change your password or revoke your active sessions.</p>
        </section>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">
            <CircleAlert size={17} /> {error}
          </div>
        )}
        <form onSubmit={(event) => void changePassword(event)} className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111820] p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white"><KeyRound size={16} className="text-cyan-300" /> Change password</div>
          <label className="block text-xs text-slate-400">Current password
            <input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">New password (12–128 characters)
              <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white" />
            </label>
            <label className="block text-xs text-slate-400">Confirm new password
              <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2.5 text-sm text-white" />
            </label>
          </div>
          <button disabled={saving} type="submit" className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {saving ? "Updating…" : "Update password"}
          </button>
          <p className="text-xs text-slate-500">Changing your password revokes all active tokens. Sign in again with your new password.</p>
        </form>
        <section className="flex flex-col justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#111820] p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-medium text-white">Sign out everywhere</h2>
            <p className="mt-1 text-xs text-slate-500">Revoke all active tokens for this account, including this session.</p>
          </div>
          <button disabled={saving} onClick={() => void revokeSessions()} className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm text-rose-200 hover:bg-rose-400/[0.08] disabled:opacity-50">
            Revoke sessions
          </button>
        </section>
      </div>
    </main>
  );
}
