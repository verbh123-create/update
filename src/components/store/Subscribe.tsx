"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { addDays, bhParts } from "@/lib/time";
import { Img, Stepper, toast } from "@/components/ui";
import { useErr, useLocalized, useMoney, useSite, useT } from "@/components/I18n";
import type { Customer, StoreData } from "./shared";

type Summary = { count: number; skipped: string[]; perDelivery: number; perDeliverySubtotal: number; discountPerDelivery: number; total: number; saving: number };

export default function Subscribe({ data, customer, openAuth, onCreated }: { data: StoreData; customer: Customer | null; openAuth: () => void; onCreated: () => void }) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const money = useMoney();
  const { settings } = useSite();
  const truck = data.truck;
  const today = bhParts().date;

  const [qty, setQty] = useState<Record<number, number>>({});
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 7));
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !truck.hours[d]?.closed);
  const [days, setDays] = useState<number[]>(openDays);
  const [slotId, setSlotId] = useState(truck.slots[0]?.id ?? "");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [regionId, setRegionId] = useState("");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [method, setMethod] = useState<"cash" | "benefit">(truck.pay.cash ? "cash" : "benefit");
  const [notes, setNotes] = useState("");
  const [sum, setSum] = useState<Summary | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customer) {
      setAddress((a) => a || customer.address);
      const r = data.regions.find((x) => x.nameEn.toLowerCase() === customer.regionName.toLowerCase());
      if (r) setRegionId((cur) => cur || String(r.id));
    }
  }, [customer, data.regions]);

  const cart = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ itemId: Number(id), qty: q, removed: [], extras: [] })), [qty]);
  const body = useMemo(
    () => ({ truck: truck.slug, cart, startDate: start, endDate: end, days, slotId, fulfillment, regionId: Number(regionId) || null, address, paymentMethod: method, notes }),
    [truck.slug, cart, start, end, days, slotId, fulfillment, regionId, address, method, notes],
  );

  useEffect(() => {
    if (!cart.length || !days.length || !slotId) {
      setSum(null);
      setMsg(!cart.length ? t("sub.noItems") : "");
      return;
    }
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const r = await api<{ summary: Summary }>("/api/subscriptions", { body: { ...body, dryRun: true } });
        if (alive) {
          setSum(r.summary);
          setMsg("");
        }
      } catch (e) {
        if (alive) {
          setSum(null);
          setMsg(err((e as { code?: string }).code));
        }
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [body, cart.length, days.length, slotId, err, t]);

  const create = async () => {
    if (!customer) {
      toast(t("sub.loginRequired"), "err");
      return openAuth();
    }
    setBusy(true);
    try {
      await api("/api/subscriptions", { body });
      toast(t("sub.success"));
      setQty({});
      onCreated();
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="h-title text-accent">{t("sub.title", { percent: settings.subscriptionDiscount })}</h2>
          <p className="mt-1 text-muted">{t("sub.desc")}</p>
        </div>

        <section className="card p-5">
          <h3 className="mb-3 font-bold">{t("sub.items")}</h3>
          <div className="space-y-5">
            {data.categories.map((c) => {
              const list = data.items.filter((i) => i.categoryId === c.id);
              if (!list.length) return null;
              return (
                <div key={c.id}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
                    {L(c.nameEn, c.nameAr)}
                    {c.timeFrom && c.timeTo && (
                      <span className="chip">
                        {c.timeFrom} – {c.timeTo}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((i) => (
                      <div key={i.id} className="card-2 flex items-center gap-3 p-2.5">
                        <Img src={i.imageUrl} emoji={i.emoji} className="h-12 w-12 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{L(i.nameEn, i.nameAr)}</div>
                          <div className="text-xs font-bold text-accent">{money(i.price)}</div>
                        </div>
                        <Stepper value={qty[i.id] ?? 0} onChange={(v) => setQty((q) => ({ ...q, [i.id]: v }))} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h3 className="mb-2 font-bold">{t("sub.range")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-muted">
                {t("sub.from")}
                <input type="date" className="input mt-1" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="text-sm text-muted">
                {t("sub.to")}
                <input type="date" className="input mt-1" min={start} max={addDays(start, 92)} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-bold">{t("sub.days")}</h3>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const closed = !!truck.hours[d]?.closed;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={closed}
                    onClick={() => toggleDay(d)}
                    className={`btn btn-sm ${days.includes(d) && !closed ? "btn-primary" : "btn-ghost"}`}
                    title={closed ? t("sub.closedDay") : ""}
                  >
                    {t(`day.${d}`)}
                    {closed && <span className="text-xs text-bad"> ✕ {t("sub.closedDay")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              {t("sub.slot")}
              <select className="input mt-1" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                {truck.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.from} – {s.to}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm font-bold">
              {t("checkout.fulfillment")}
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" className={`btn btn-sm ${fulfillment === "delivery" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFulfillment("delivery")}>
                  🛵 {t("checkout.delivery")}
                </button>
                <button type="button" className={`btn btn-sm ${fulfillment === "pickup" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFulfillment("pickup")}>
                  🏪 {t("checkout.pickup")}
                </button>
              </div>
            </div>
          </div>
          {fulfillment === "delivery" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="input" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">{t("common.region")}…</option>
                {data.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {L(r.nameEn, r.nameAr)} — {money(r.fee)}
                  </option>
                ))}
              </select>
              <input className="input" placeholder={t("common.address")} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {truck.pay.cash && (
              <button type="button" className={`btn btn-sm ${method === "cash" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMethod("cash")}>
                💵 {t("pay.cash")}
              </button>
            )}
            {truck.pay.benefit && (
              <button type="button" className={`btn btn-sm ${method === "benefit" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMethod("benefit")}>
                📲 {t("pay.benefit")}
              </button>
            )}
          </div>
          <textarea className="input" rows={2} placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card glow space-y-2 p-5">
          {sum ? (
            <>
              <p className="text-lg font-black">{t("sub.summary", { n: sum.count })}</p>
              <div className="flex justify-between text-sm text-muted">
                <span>{t("common.subtotal")}</span>
                <span>{money(sum.perDeliverySubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-good">
                <span>{t("checkout.sumSubscription")}</span>
                <span>- {money(sum.discountPerDelivery)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t("sub.perDelivery")}</span>
                <span>{money(sum.perDelivery)}</span>
              </div>
              <div className="my-2 border-t border-line" />
              <div className="flex justify-between text-xl font-black">
                <span>{t("sub.grandTotal")}</span>
                <span className="text-accent">{money(sum.total)}</span>
              </div>
              <p className="text-sm font-bold text-good">🎉 {t("sub.saving", { amount: money(sum.saving) })}</p>
              {sum.skipped.length > 0 && <p className="text-xs text-muted">{t("sub.skipped", { dates: sum.skipped.join(", ") })}</p>}
            </>
          ) : (
            <p className="text-sm font-semibold text-muted">{msg || t("common.loading")}</p>
          )}
          <p className="text-xs text-muted">{t("sub.rule", { minutes: settings.cancelSubMin })}</p>
          <button className="btn btn-primary w-full" disabled={busy || !sum} onClick={create}>
            {t("sub.create")}
          </button>
          {!customer && <p className="text-xs text-muted">{t("sub.loginRequired")}</p>}
        </div>
      </aside>
    </div>
  );
}
