"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { Spinner, toast } from "@/components/ui";

const MAP: Record<string, string> = {
  forbidden: "You don't have permission for that.",
  unauthorized: "Session expired — please sign in again.",
  category_not_empty: "This category still has items. Move or delete them first.",
  email_exists: "That username already exists.",
  weak_password: "Password must be at least 6 characters.",
  no_deliveries: "Nothing to pay for this driver in the selected range.",
  completed_locked: "Completed orders are locked.",
  invalid_input: "Please check the entered values.",
  not_found: "Not found.",
};
export const adminErr = (e: unknown) => {
  const c = (e as { code?: string }).code ?? "generic";
  return MAP[c] ?? (c === "generic" ? "Something went wrong." : c);
};

export function useRows<T>(base: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<{ rows: T[] }>(base);
      setRows(r.rows);
    } catch (e) {
      toast(adminErr(e), "err");
      setRows([]);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (v: Record<string, unknown> & { id?: number }) => {
    try {
      await api(base, { method: v.id ? "PUT" : "POST", body: v });
      await load();
      toast("Saved");
      return true;
    } catch (e) {
      toast(adminErr(e), "err");
      return false;
    }
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await api(`${base}?id=${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };
  return { rows, load, save, remove };
}

export function Loading({ rows }: { rows: unknown }) {
  return rows === null ? <Spinner /> : null;
}

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mb-5 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-title !text-[1.15rem]">{title}</h3>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card-2 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-black text-accent">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export const Money = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(3)} BHD`;

export function DateRange({
  from,
  to,
  onChange,
  today,
  addDays,
}: {
  from: string;
  to: string;
  onChange: (f: string, t: string) => void;
  today: string;
  addDays: (d: string, n: number) => string;
}) {
  const monthStart = `${today.slice(0, 8)}01`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(today, today)}>
        Daily
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(addDays(today, -6), today)}>
        Weekly
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(monthStart, today)}>
        Monthly
      </button>
      <label className="text-xs font-bold text-muted">
        From
        <input type="date" className="input !min-h-9 !py-1" value={from} onChange={(e) => onChange(e.target.value, to < e.target.value ? e.target.value : to)} />
      </label>
      <label className="text-xs font-bold text-muted">
        To
        <input type="date" className="input !min-h-9 !py-1" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} />
      </label>
    </div>
  );
}
