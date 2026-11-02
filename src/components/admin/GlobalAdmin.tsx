"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { THEMES, type PublicSettings } from "@/lib/types";
import { Field, ImageUploader, LogoutButton, Toggle, toast } from "@/components/ui";
import { useSite } from "@/components/I18n";
import { adminErr, Loading, Money, Panel, Stat } from "./shared";
import TruckAdmin, { LiveOrders, type AdminStaff } from "./TruckAdmin";
import { EmployeesTab } from "./OpsTabs";
import { TextsEditor } from "./ContentEditor";

type Truck = { id: number; slug: string; name: string };
type TruckStat = { id: number; slug: string; nameEn: string; status: string; ordersToday: number; revenueToday: number; ordersMonth: number; revenueMonth: number; pending: number };

export default function GlobalAdmin({ staff, trucks }: { staff: AdminStaff; trucks: Truck[] }) {
  const { settings } = useSite();
  const tabs = [
    { id: "overview", label: "📈 Command center" },
    { id: "feed", label: "🔥 Live feed (all trucks)" },
    ...trucks.map((t) => ({ id: `truck:${t.slug}`, label: `${t.slug === "beverage" ? "🥤" : "🍔"} ${t.name} panel` })),
    { id: "theme", label: "🎨 Themes" },
    { id: "settings", label: "⚙️ Global settings" },
    { id: "texts", label: "✏️ Texts (EN/AR)" },
    { id: "staff", label: "🔐 Employees & POS roles" },
  ];
  const [tab, setTab] = useState("overview");
  const [feed, setFeed] = useState("all");
  const active = trucks.find((t) => tab === `truck:${t.slug}`);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="h-10 w-auto rounded-md" />}
        <div className="flex-1">
          <div className="font-black">Super Admin · Global command center</div>
          <div className="text-xs text-muted">{staff.name}</div>
        </div>
        <a className="btn btn-ghost btn-sm" href="/" target="_blank">Landing ↗</a>
        <LogoutButton label="Sign out" />
      </header>

      <div className="mx-auto max-w-7xl p-3 sm:p-5">
        <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <Overview />}
        {tab === "feed" && (
          <div>
            <div className="mb-3 flex gap-2">
              <button className={`btn btn-sm ${feed === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFeed("all")}>All trucks</button>
              {trucks.map((t) => (
                <button key={t.id} className={`btn btn-sm ${feed === t.slug ? "btn-primary" : "btn-ghost"}`} onClick={() => setFeed(t.slug)}>{t.name}</button>
              ))}
            </div>
            <LiveOrders key={feed} slug={feed} canDrivers={false} feedUrl={`/api/admin/global/orders?truck=${feed}`} />
          </div>
        )}
        {active && <TruckAdmin key={active.slug} slug={active.slug} truckName={active.name} staff={{ ...staff, isSuper: true }} embedded />}
        {tab === "theme" && <ThemePicker />}
        {tab === "settings" && <GlobalSettings />}
        {tab === "texts" && <TextsEditor base="/api/admin/global/texts" />}
        {tab === "staff" && <EmployeesTab base="/api/admin/global/staff" meId={staff.id} trucks={trucks.map((t) => ({ id: t.id, name: t.name }))} />}
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<TruckStat[] | null>(null);
  const load = useCallback(async () => {
    try {
      setStats((await api<{ stats: TruckStat[] }>("/api/admin/global/overview")).stats);
    } catch (e) {
      toast(adminErr(e), "err");
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);
  if (!stats) return <Loading rows={null} />;
  const sum = (f: (s: TruckStat) => number) => stats.reduce((a, s) => a + f(s), 0);
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue today" value={Money(sum((s) => s.revenueToday))} sub={`${sum((s) => s.ordersToday)} orders`} />
        <Stat label="Revenue this month" value={Money(sum((s) => s.revenueMonth))} sub={`${sum((s) => s.ordersMonth)} orders`} />
        <Stat label="In kitchen now" value={sum((s) => s.pending)} sub="not ready orders" />
        <Stat label="Trucks open" value={`${stats.filter((s) => s.status !== "closed").length} / ${stats.length}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((s) => (
          <Panel key={s.id} title={`${s.slug === "beverage" ? "🥤" : "🍔"} ${s.nameEn}`} actions={<span className={`chip ${s.status === "open" ? "chip-good" : s.status === "busy" ? "chip-accent" : "chip-bad"}`}>● {s.status}</span>}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Today" value={Money(s.revenueToday)} sub={`${s.ordersToday} orders`} />
              <Stat label="This month" value={Money(s.revenueMonth)} sub={`${s.ordersMonth} orders`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn btn-ghost btn-sm" href={`/admin/${s.slug}`} target="_blank">Admin ↗</a>
              <a className="btn btn-ghost btn-sm" href={`/pos/${s.slug}`} target="_blank">POS ↗</a>
              <a className="btn btn-ghost btn-sm" href={`/kitchen/${s.slug}`} target="_blank">Kitchen ↗</a>
              <a className="btn btn-ghost btn-sm" href={`/${s.slug}`} target="_blank">Storefront ↗</a>
              <span className="chip">{s.pending} pending</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ThemePicker() {
  const { settings } = useSite();
  const [theme, setTheme] = useState(settings.theme);
  const choose = async (id: string) => {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      await api("/api/admin/global/settings", { method: "PUT", body: { theme: id } });
      toast("Theme applied across the whole site");
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };
  return (
    <Panel title="Multi-theme picker">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t.id)}
            className={`card overflow-hidden p-0 text-start transition hover:-translate-y-0.5 ${theme === t.id ? "ring-2 ring-accent" : ""}`}
          >
            <div className="flex h-24" style={{ background: t.colors[0] }}>
              <div className="m-3 flex-1 rounded-xl" style={{ background: t.colors[1] }} />
              <div className="m-3 flex w-16 items-center justify-center rounded-xl text-xs font-black" style={{ background: t.colors[2], color: "#111" }}>
                CTA
              </div>
            </div>
            <div className="flex items-center justify-between p-3">
              <b>{t.name}</b>
              {theme === t.id && <span className="chip chip-good">Active</span>}
            </div>
            <div className="flex gap-1 px-3 pb-3">
              {t.colors.map((c) => (
                <span key={c} className="h-4 w-8 rounded border border-line" style={{ background: c }} title={c} />
              ))}
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function GlobalSettings() {
  const [s, setS] = useState<PublicSettings | null>(null);
  useEffect(() => {
    api<{ settings: PublicSettings }>("/api/admin/global/settings").then((r) => setS(r.settings)).catch((e) => toast(adminErr(e), "err"));
  }, []);
  if (!s) return <Loading rows={null} />;
  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    try {
      await api("/api/admin/global/settings", { method: "PUT", body: s });
      toast("Settings saved — refresh storefronts to see changes");
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };
  return (
    <div>
      <Panel title="Branding & images" actions={<button className="btn btn-primary btn-sm" onClick={save}>Save all settings</button>}>
        <div className="grid gap-3 md:grid-cols-2">
          <ImageUploader contain label="Main website logo (favicon & landing)" value={s.logoUrl} onChange={(u) => set("logoUrl", u)} />
          <ImageUploader contain label="Header logo (storefront, POS, kitchen, admin)" value={s.headerLogoUrl} onChange={(u) => set("headerLogoUrl", u)} />
          <ImageUploader contain label="Receipt / invoice logo" value={s.receiptLogoUrl} onChange={(u) => set("receiptLogoUrl", u)} />
          <ImageUploader label="Hero / landing background" value={s.heroBgUrl} onChange={(u) => set("heroBgUrl", u)} />
        </div>
        <p className="mt-2 text-xs text-muted">Truck card images, product photos, category icons, ingredient images, banners and the BenefitPay QR are managed in each truck panel.</p>
      </Panel>

      <Panel title="Contact & map">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="WhatsApp number" hint="Digits only. 8-digit numbers get +973 added automatically (e.g. 33314261)."><input className="input" value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
          <Field label="Map label (shown on landing)"><input className="input" value={s.mapLabel} onChange={(e) => set("mapLabel", e.target.value)} /></Field>
          <Field className="md:col-span-2" label="Truck location (Google Maps)" hint="Paste an address, “lat,lng”, a Google Maps embed URL, or a long Google Maps link.">
            <input className="input" value={s.mapQuery} onChange={(e) => set("mapQuery", e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Loyalty, subscriptions & grace periods">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card-2 p-4 md:col-span-3">
            <Toggle checked={s.loyaltyEnabled} onChange={(v) => set("loyaltyEnabled", v)} label="Loyalty points master switch (buy 10, get the 11th free)" />
          </div>
          <Field label="Subscription discount (%)"><input type="number" min="0" max="90" step="0.5" className="input" value={s.subscriptionDiscount} onChange={(e) => set("subscriptionDiscount", Number(e.target.value))} /></Field>
          <Field label="Direct order edit/cancel window (minutes)"><input type="number" min="0" className="input" value={s.cancelDirectMin} onChange={(e) => set("cancelDirectMin", Number(e.target.value))} /></Field>
          <Field label="Subscription edit/cancel cut-off (minutes before delivery)"><input type="number" min="0" className="input" value={s.cancelSubMin} onChange={(e) => set("cancelSubMin", Number(e.target.value))} /></Field>
          <Field label="Kitchen alert interval · direct orders (min)"><input type="number" min="1" className="input" value={s.directAlertMin} onChange={(e) => set("directAlertMin", Number(e.target.value))} /></Field>
          <Field label="Kitchen alert interval · subscriptions (min)"><input type="number" min="1" className="input" value={s.subAlertMin} onChange={(e) => set("subAlertMin", Number(e.target.value))} /></Field>
          <Field label="Default language">
            <select className="input" value={s.defaultLang} onChange={(e) => set("defaultLang", e.target.value as "en" | "ar")}>
              <option value="en">English (LTR)</option>
              <option value="ar">العربية (RTL)</option>
            </select>
          </Field>
        </div>
      </Panel>
    </div>
  );
}
