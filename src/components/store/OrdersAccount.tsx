"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { Modal, Spinner, Stepper, toast } from "@/components/ui";
import { useErr, useLocalized, useMoney, useSite, useT } from "@/components/I18n";
import { countdown, useTick, type Customer, type StoreData } from "./shared";

export function OrdersTab({
  data,
  customer,
  guestRefs,
  openAuth,
}: {
  data: StoreData;
  customer: Customer | null;
  guestRefs: () => string[];
  openAuth: () => void;
}) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const money = useMoney();
  const { settings, lang } = useSite();
  const now = useTick(1000);
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [editing, setEditing] = useState<OrderView | null>(null);

  const load = useCallback(async () => {
    try {
      const refs = guestRefs().join(",");
      const r = await api<{ orders: OrderView[] }>(`/api/orders?truck=${data.truck.slug}&refs=${encodeURIComponent(refs)}`);
      setOrders(r.orders);
    } catch {
      setOrders((o) => o ?? []);
    }
  }, [data.truck.slug, guestRefs]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  // guest tokens are only kept in memory for orders placed on this device
  const tokenFor = (id: number) => guestRefs().find((r) => r.startsWith(`${id}:`))?.split(":")[1] ?? "";

  const cancel = async (o: OrderView) => {
    if (!confirm(t("orders.cancelConfirm"))) return;
    try {
      await api(`/api/orders/${o.id}?token=${encodeURIComponent(tokenFor(o.id))}`, { method: "DELETE" });
      toast(t("orders.cancelled"));
      void load();
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
      void load();
    }
  };

  const cancelSub = async (id: number) => {
    if (!confirm(t("orders.cancelConfirm"))) return;
    try {
      await api(`/api/subscriptions/${id}`, { method: "DELETE" });
      toast(t("orders.cancelled"));
      void load();
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    }
  };

  if (orders === null) return <Spinner />;
  if (!orders.length)
    return (
      <div className="py-12 text-center text-muted">
        <p>{t("orders.empty")}</p>
        {!customer && (
          <button className="btn btn-ghost mt-4" onClick={openAuth}>
            {t("auth.login")}
          </button>
        )}
      </div>
    );

  const direct = orders.filter((o) => o.kind !== "subscription");
  const subs = orders.filter((o) => o.kind === "subscription").sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  const subIds = [...new Set(subs.filter((s) => s.status === "NOT_READY").map((s) => s.subscriptionId).filter((x): x is number => !!x))];

  const renderCard = (o: OrderView) => {
    const left = o.modifyUntil ? new Date(o.modifyUntil).getTime() - now : 0;
    const can = o.canModify && left > 0;
    return (
      <div key={o.id} className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-lg">{o.orderNo}</b>
          <span className={`chip ${o.status === "COMPLETED" ? "chip-good" : o.status === "CANCELLED" ? "chip-bad" : "chip-accent"}`}>{t(`orders.status.${o.status}`)}</span>
          <span className="chip">{t(`orders.kind.${o.kind}`)}</span>
          <span className={`chip ${o.paymentStatus === "paid" ? "chip-good" : ""}`}>{t(`pay.status.${o.paymentStatus}`)}</span>
          <span className="ms-auto text-xs text-muted">{fmtDateTime(o.createdAt, lang)}</span>
        </div>
        {o.scheduledFor && <p className="mt-2 text-sm font-bold text-accent">📅 {t("orders.scheduledFor", { when: fmtDateTime(o.scheduledFor, lang) })}</p>}
        <ul className="mt-3 space-y-1 text-sm">
          {o.items.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {l.qty}× {L(l.nameEn, l.nameAr)}
                {l.removedNames.length > 0 && <span className="text-xs text-muted"> ({l.removedNames.map((r) => `− ${L(r.en, r.ar)}`).join(", ")})</span>}
                {l.extraNames.length > 0 && <span className="text-xs text-muted"> ({l.extraNames.map((r) => `+ ${L(r.en, r.ar)}`).join(", ")})</span>}
                {l.freeUnits > 0 && <span className="chip chip-accent ms-1">🎁 {t("store.rewardBadge")}</span>}
              </span>
              <span className="text-muted">{money(l.unitPrice * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-muted">
            {o.fulfillment === "delivery" ? `🛵 ${o.regionName}${o.deliverySlot ? ` · ${o.deliverySlot}` : ""}` : `🏪 ${t("checkout.pickup")}`}
          </span>
          <b className="text-lg text-accent">{money(o.total)}</b>
        </div>
        {o.status === "NOT_READY" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {can ? (
              <>
                <span className="chip chip-accent">⏱ {t("orders.modifyLeft", { time: countdown(left) })}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(o)}>
                  ✏️ {t("orders.edit")}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => cancel(o)}>
                  {t("orders.cancel")}
                </button>
              </>
            ) : (
              <span className="text-xs text-muted">🔒 {t("orders.locked")}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {direct.length > 0 && (
        <section className="space-y-3">
          <h2 className="h-title">{t("kds.direct")}</h2>
          {direct.map((o) => renderCard(o))}
        </section>
      )}
      {subs.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-title">{t("kds.subs")}</h2>
            {subIds.map((id) => (
              <button key={id} className="btn btn-danger btn-sm" onClick={() => cancelSub(id)}>
                {t("orders.cancel")} #{id}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("sub.rule", { minutes: settings.cancelSubMin })}</p>
          {subs.map((o) => renderCard(o))}
        </section>
      )}
      {editing && (
        <EditOrder
          order={editing}
          data={data}
          token={tokenFor(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function EditOrder({ order, data, token, onClose, onSaved }: { order: OrderView; data: StoreData; token: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const [qty, setQty] = useState(order.items.map((l) => l.qty));
  const [notes, setNotes] = useState(order.notes);
  const [address, setAddress] = useState(order.address);
  const [busy, setBusy] = useState(false);
  void data;

  const save = async () => {
    setBusy(true);
    try {
      const cart = order.items.map((l, i) => ({ itemId: l.itemId, qty: qty[i], removed: l.removed, extras: l.extras })).filter((c) => c.qty >= 1);
      if (!cart.length) {
        toast(err("empty_cart"), "err");
        return;
      }
      await api(`/api/orders/${order.id}`, { method: "PATCH", body: { token, cart, notes, address: order.fulfillment === "delivery" ? address : undefined } });
      toast(t("orders.updated"));
      onSaved();
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${t("orders.editTitle")} · ${order.orderNo}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">{t("orders.qtyHint")}</p>
        {order.items.map((l, i) => (
          <div key={i} className="card-2 flex items-center justify-between gap-2 p-3">
            <span className="font-semibold">{L(l.nameEn, l.nameAr)}</span>
            <Stepper value={qty[i]} onChange={(v) => setQty((q) => q.map((x, j) => (j === i ? v : x)))} />
          </div>
        ))}
        {order.fulfillment === "delivery" && <textarea className="input" rows={2} placeholder={t("common.address")} value={address} onChange={(e) => setAddress(e.target.value)} />}
        <textarea className="input" rows={2} placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy} onClick={save}>
          {t("orders.saveChanges")}
        </button>
      </div>
    </Modal>
  );
}

export function AccountTab({
  data,
  customer,
  setCustomer,
  openAuth,
}: {
  data: StoreData;
  customer: Customer | null;
  setCustomer: (c: Customer | null) => void;
  openAuth: () => void;
}) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const { settings } = useSite();
  const [f, setF] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", regionName: customer?.regionName ?? "", address: customer?.address ?? "", password: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (customer) setF({ name: customer.name, phone: customer.phone, regionName: customer.regionName, address: customer.address, password: "" });
  }, [customer]);

  if (!customer)
    return (
      <div className="py-12 text-center">
        <p className="text-muted">{t("acct.loginPrompt")}</p>
        <button className="btn btn-primary mt-4" onClick={openAuth}>
          {t("auth.login")} / {t("auth.register")}
        </button>
      </div>
    );

  const th = Math.max(1, data.truck.loyaltyThreshold);
  const stamps = customer.loyalty[String(data.truck.id)] ?? 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, string> = { name: f.name, phone: f.phone, regionName: f.regionName, address: f.address };
      if (f.password) body.password = f.password;
      const r = await api<{ customer: Customer }>("/api/auth/customer", { method: "PATCH", body });
      setCustomer(r.customer);
      toast(t("acct.saved"));
    } catch (x) {
      toast(err((x as { code?: string }).code), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <form onSubmit={save} className="card space-y-3 p-5">
        <h2 className="h-title">{t("acct.profile")}</h2>
        <input className="input" placeholder={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className="input" type="tel" placeholder={t("common.phone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <input className="input opacity-60" value={customer.email} disabled />
        <h3 className="pt-2 font-bold">{t("acct.defaultAddress")}</h3>
        <select className="input" value={f.regionName} onChange={(e) => setF({ ...f, regionName: e.target.value })}>
          <option value="">{t("common.region")}…</option>
          {data.regions.map((r) => (
            <option key={r.id} value={r.nameEn}>
              {L(r.nameEn, r.nameAr)}
            </option>
          ))}
        </select>
        <textarea className="input" rows={2} placeholder={t("common.address")} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <input className="input" type="password" minLength={6} placeholder={t("auth.newPassword")} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        <button className="btn btn-primary w-full" disabled={busy}>
          {t("acct.save")}
        </button>
      </form>

      {settings.loyaltyEnabled && (
        <div className="card p-5">
          <h3 className="font-bold">🎟️ {t("store.loyaltyTitle")}</h3>
          <p className="mt-1 text-sm text-muted">{t("store.loyaltyProgress", { n: stamps % th, total: th })}</p>
          <p className="text-sm text-accent">{Math.floor(stamps / th) > 0 ? t("store.loyaltyReady", { n: Math.floor(stamps / th) }) : t("store.loyaltyHint", { total: th })}</p>
        </div>
      )}

      <button
        className="btn btn-ghost w-full"
        onClick={async () => {
          await api("/api/auth/customer", { body: { action: "logout" } });
          setCustomer(null);
        }}
      >
        {t("auth.logout")}
      </button>
    </div>
  );
}
