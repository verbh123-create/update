"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, beep, unlockAudio } from "@/lib/client";
import { fmtDateTime } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { LogoutButton, toast } from "@/components/ui";
import { useSite } from "@/components/I18n";
import { adminErr, Money } from "./shared";
import MenuManager from "./MenuManager";
import { DriversTab, ReportsTab } from "./DriversReports";
import { CustomersTab, EmployeesTab, HoursTab, PaymentsTab, PromosTab, RegionsTab } from "./OpsTabs";
import { ContentTab } from "./ContentEditor";

export type AdminStaff = { id: number; name: string; isSuper: boolean; permissions: string[] };
type Driver = { id: number; name: string; defaultCommission: number; active: boolean };

const TABS = [
  { id: "orders", label: "Live orders", perm: "orders", icon: "🔥" },
  { id: "drivers", label: "Drivers", perm: "drivers", icon: "🛵" },
  { id: "reports", label: "Reports", perm: "reports", icon: "📊" },
  { id: "menu", label: "Menu & stock", perm: "menu", icon: "🍔" },
  { id: "hours", label: "Hours & status", perm: "hours", icon: "🕒" },
  { id: "regions", label: "Delivery regions", perm: "regions", icon: "📍" },
  { id: "promos", label: "Promotions", perm: "promos", icon: "🎟️" },
  { id: "payments", label: "Payments", perm: "payments", icon: "💳" },
  { id: "customers", label: "Customers", perm: "customers", icon: "👥" },
  { id: "employees", label: "Employees", perm: "employees", icon: "🔐" },
  { id: "content", label: "Texts & images", perm: "content", icon: "✏️" },
];

export default function TruckAdmin({ slug, truckName, staff, embedded }: { slug: string; truckName: string; staff: AdminStaff; embedded?: boolean }) {
  const { settings } = useSite();
  const tabs = TABS.filter((t) => staff.isSuper || staff.permissions.includes(t.perm));
  const [tab, setTab] = useState(tabs[0]?.id ?? "orders");
  const quickLinks = staff.isSuper || staff.permissions.includes("pos") || staff.permissions.includes("kitchen");

  return (
    <div className="min-h-dvh">
      {!embedded && (
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="h-10 w-auto rounded-md" />}
          <div className="flex-1">
            <div className="font-black">Admin · {truckName}</div>
            <div className="text-xs text-muted">{staff.name}</div>
          </div>
          {quickLinks && (
            <div className="hidden gap-2 sm:flex">
              <a className="btn btn-ghost btn-sm" href={`/pos/${slug}`} target="_blank">POS ↗</a>
              <a className="btn btn-ghost btn-sm" href={`/kitchen/${slug}`} target="_blank">Kitchen ↗</a>
              <a className="btn btn-ghost btn-sm" href={`/${slug}`} target="_blank">Storefront ↗</a>
            </div>
          )}
          <LogoutButton label="Sign out" />
        </header>
      )}
      <div className={embedded ? "" : "mx-auto max-w-7xl p-3 sm:p-5"}>
        <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "tab-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        {tab === "orders" && <LiveOrders slug={slug} canDrivers={staff.isSuper || staff.permissions.includes("orders")} />}
        {tab === "drivers" && <DriversTab slug={slug} />}
        {tab === "reports" && <ReportsTab slug={slug} />}
        {tab === "menu" && <MenuManager slug={slug} />}
        {tab === "hours" && <HoursTab slug={slug} />}
        {tab === "regions" && <RegionsTab slug={slug} />}
        {tab === "promos" && <PromosTab slug={slug} />}
        {tab === "payments" && <PaymentsTab slug={slug} />}
        {tab === "customers" && <CustomersTab slug={slug} />}
        {tab === "employees" && <EmployeesTab base={`/api/admin/${slug}/staff`} meId={staff.id} />}
        {tab === "content" && <ContentTab slug={slug} />}
      </div>
    </div>
  );
}

/* ───────────── live orders ───────────── */
export function LiveOrders({ slug, canDrivers, feedUrl }: { slug: string; canDrivers: boolean; feedUrl?: string }) {
  const { lang } = useSite();
  const url = feedUrl ?? `/api/admin/${slug}/orders`;
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [sound, setSound] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [date, setDate] = useState("");
  const seen = useRef<Set<number> | null>(null);
  const soundRef = useRef(false);
  soundRef.current = sound;

  const load = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderView[] }>(`${url}${date ? (url.includes("?") ? "&" : "?") + `date=${date}` : ""}`);
      if (seen.current === null) seen.current = new Set(r.orders.map((o) => o.id));
      else {
        const fresh = r.orders.filter((o) => !seen.current!.has(o.id) && !(o.paymentMethod === "card" && o.paymentStatus !== "paid"));
        if (fresh.length) {
          fresh.forEach((o) => seen.current!.add(o.id));
          if (soundRef.current) beep(4);
          toast(`🔔 New order ${fresh[0].orderNo}`);
        }
        r.orders.forEach((o) => seen.current!.add(o.id));
      }
      setOrders(r.orders);
    } catch (e) {
      setOrders((o) => o ?? []);
      toast(adminErr(e), "err");
    }
  }, [url, date]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!canDrivers || feedUrl) return;
    api<{ rows: Driver[] }>(`/api/admin/${slug}/drivers`).then((r) => setDrivers(r.rows.filter((d) => d.active))).catch(() => undefined);
  }, [slug, canDrivers, feedUrl]);

  const patch = async (o: OrderView, body: Record<string, unknown>) => {
    try {
      await api(`/api/admin/${o.truckSlug || slug}/orders`, { method: "PATCH", body: { id: o.id, ...body } });
      await load();
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };

  const list = (orders ?? []).filter((o) => (filter === "all" ? true : o.status === "NOT_READY"));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          className={`btn btn-sm ${sound ? "btn-soft" : "btn-primary"}`}
          onClick={() => {
            if (unlockAudio()) {
              setSound(true);
              beep(2);
            }
          }}
        >
          {sound ? "🔔 Sound alerts on" : "🔕 Enable sound alerts"}
        </button>
        <button className={`btn btn-sm ${filter === "active" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("active")}>
          Not ready
        </button>
        <button className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("all")}>
          All
        </button>
        <input type="date" className="input !min-h-9 !w-auto !py-1" value={date} onChange={(e) => setDate(e.target.value)} />
        {date && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDate("")}>
            Clear date
          </button>
        )}
        <span className="chip ms-auto">{list.length} orders</span>
      </div>

      {orders === null && <p className="text-muted">Loading…</p>}
      {orders && list.length === 0 && <p className="py-10 text-center text-muted">No orders to show.</p>}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {list.map((o) => {
          const hiddenCard = o.paymentMethod === "card" && o.paymentStatus !== "paid";
          return (
            <article key={o.id} className={`card space-y-2 p-4 ${o.status === "CANCELLED" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-lg">{o.orderNo}</b>
                <span className={`chip ${o.status === "COMPLETED" ? "chip-good" : o.status === "CANCELLED" ? "chip-bad" : "chip-accent"}`}>{o.status === "NOT_READY" ? "NOT READY" : o.status}</span>
                <span className="chip">{o.kind}</span>
                <span className="chip">{o.fulfillment === "delivery" ? "🛵 delivery" : o.fulfillment === "pickup" ? "🏪 pickup" : "🧍 walk-in"}</span>
                {hiddenCard && <span className="chip chip-bad">awaiting card payment</span>}
                <span className="ms-auto text-xs text-muted">{fmtDateTime(o.createdAt, lang === "ar" ? "en" : lang)}</span>
              </div>
              {o.scheduledFor && <div className="text-sm font-bold text-accent">📅 Scheduled {fmtDateTime(o.scheduledFor, "en")}</div>}
              <div className="text-sm">
                <b>{o.customerName ?? "—"}</b> {o.customerPhone && <a className="text-accent" href={`tel:${o.customerPhone}`}>{o.customerPhone}</a>}
                {o.fulfillment === "delivery" && (
                  <div className="text-muted">
                    📍 {o.regionName} — {o.address} {o.deliverySlot && `· ${o.deliverySlot}`}
                  </div>
                )}
              </div>
              <ul className="space-y-0.5 border-y border-line py-2 text-sm">
                {o.items.map((l, i) => (
                  <li key={i}>
                    <b className="text-accent">{l.qty}×</b> {l.nameEn}
                    {l.removedNames.length > 0 && <span className="text-xs text-bad"> {l.removedNames.map((r) => `−${r.en}`).join(" ")}</span>}
                    {l.extraNames.length > 0 && <span className="text-xs text-good"> {l.extraNames.map((r) => `+${r.en}`).join(" ")}</span>}
                    {l.freeUnits > 0 && <span className="chip chip-accent ms-1">🎁 free ×{l.freeUnits}</span>}
                  </li>
                ))}
              </ul>
              {o.notes && <p className="text-xs">📝 {o.notes}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {o.paymentMethod === "cash" ? "💵 Cash" : o.paymentMethod === "benefit" ? "📲 BenefitPay" : "💳 Card"} ·{" "}
                  <span className={o.paymentStatus === "paid" ? "font-bold text-good" : "text-muted"}>{o.paymentStatus}</span>
                </span>
                <b className="text-lg text-accent">{Money(o.total)}</b>
              </div>

              {o.status !== "CANCELLED" && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                  {o.paymentStatus !== "paid" && (
                    <button className="btn btn-soft btn-sm" onClick={() => patch(o, { paymentStatus: "paid" })}>
                      ✓ Mark paid
                    </button>
                  )}
                  {o.fulfillment === "delivery" && canDrivers && !feedUrl && (
                    <>
                      <select className="input !min-h-8 !w-auto !py-1 text-sm" disabled={o.driverPaid} value={o.driverId ?? ""} onChange={(e) => patch(o, { driverId: Number(e.target.value) || 0 })}>
                        <option value="">Assign driver…</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {o.driverId && (
                        <label className="flex items-center gap-1 text-xs text-muted">
                          Commission
                          <input
                            key={`${o.id}-${o.driverCommission}`}
                            type="number"
                            step="0.1"
                            min="0"
                            disabled={o.driverPaid}
                            className="input !min-h-8 !w-20 !py-1"
                            defaultValue={o.driverCommission}
                            onBlur={(e) => Number(e.target.value) !== o.driverCommission && patch(o, { driverCommission: Number(e.target.value) })}
                          />
                        </label>
                      )}
                      <select className="input !min-h-8 !w-auto !py-1 text-sm" value={o.deliveryState} onChange={(e) => patch(o, { deliveryState: e.target.value })}>
                        <option value="pending">Delivery: pending</option>
                        <option value="out">Out for delivery</option>
                        <option value="delivered">Delivered</option>
                      </select>
                      {o.driverPaid && <span className="chip chip-good">driver paid</span>}
                    </>
                  )}
                  {o.fulfillment === "delivery" && o.driverName && (feedUrl || !canDrivers) && <span className="chip">🛵 {o.driverName}</span>}
                  {o.status === "NOT_READY" && (
                    <button
                      className="btn btn-danger btn-sm ms-auto"
                      onClick={() => confirm(`Cancel ${o.orderNo}?`) && patch(o, { action: "cancel" })}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
