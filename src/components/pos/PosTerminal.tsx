"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { Img, LogoutButton, toast } from "@/components/ui";
import { LangSwitch, useErr, useLocalized, useMoney, useSite, useT } from "@/components/I18n";
import { ItemModal } from "@/components/store/Storefront";
import { lineUnit, optionText, useCart, type StoreData, type StoreItem } from "@/components/store/shared";
import { Stepper } from "@/components/ui";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function PosTerminal({ data, staffName }: { data: StoreData; staffName: string }) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const money = useMoney();
  const { settings, lang } = useSite();
  const truck = data.truck;
  const cart = useCart(`pos-${truck.slug}`);
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<StoreItem | null>(null);
  const [type, setType] = useState<"dine_in" | "pickup" | "delivery">("dine_in");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [regionId, setRegionId] = useState("");
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState<"cash" | "benefit" | "card">("cash");
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<OrderView[]>([]);

  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const lines = cart.lines.filter((l) => itemMap.has(l.itemId));
  const subtotal = lines.reduce((s, l) => s + lineUnit(itemMap.get(l.itemId)!, l.extras) * l.qty, 0);
  const fee = type === "delivery" ? (data.regions.find((r) => String(r.id) === regionId)?.fee ?? 0) : 0;

  const loadRecent = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderView[] }>(`/api/pos/orders?truck=${truck.slug}`);
      setRecent(r.orders);
    } catch {}
  }, [truck.slug]);
  useEffect(() => {
    void loadRecent();
    const id = setInterval(loadRecent, 15000);
    return () => clearInterval(id);
  }, [loadRecent]);

  const items = data.items.filter((i) => (!cat || i.categoryId === cat) && (!q.trim() || i.nameEn.toLowerCase().includes(q.toLowerCase()) || i.nameAr.includes(q)));

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ order: OrderView }>("/api/pos/orders", {
        body: {
          truck: truck.slug,
          cart: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, removed: l.removed, extras: l.extras })),
          fulfillment: type,
          customerName: name,
          phone,
          regionId: Number(regionId) || null,
          address,
          paymentMethod: method,
          paid: paid || method === "card",
          notes,
        },
      });
      toast(t("pos.sent", { no: r.order.orderNo }));
      cart.clear();
      setName("");
      setPhone("");
      setNotes("");
      setAddress("");
      void loadRecent();
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    } finally {
      setBusy(false);
    }
  };

  const print = (o: OrderView) => {
    const w = window.open("", "_blank", "width=380,height=700");
    if (!w) return;
    const rows = o.items
      .map(
        (l) =>
          `<div class="r"><span>${l.qty}× ${esc(L(l.nameEn, l.nameAr))}</span><span>${fmtMoney(l.unitPrice * l.qty)}</span></div>` +
          [...l.removedNames.map((x) => `− ${esc(x.en)}`), ...l.extraNames.map((x) => `+ ${esc(x.en)}`)].map((x) => `<div class="s">${x}</div>`).join(""),
      )
      .join("");
    w.document.write(`<html><head><meta charset="utf-8"><title>${esc(o.orderNo)}</title><style>
      body{font-family:Arial,sans-serif;width:290px;margin:8px auto;font-size:13px;color:#000}
      img{display:block;max-width:150px;margin:0 auto 6px}.c{text-align:center}.r{display:flex;justify-content:space-between;margin:3px 0}
      .s{font-size:11px;color:#444;margin-inline-start:12px}hr{border:0;border-top:1px dashed #000;margin:8px 0}h2{margin:4px 0}
    </style></head><body>
      ${settings.receiptLogoUrl ? `<img src="${esc(settings.receiptLogoUrl)}" alt="">` : ""}
      <div class="c"><b>${esc(L(truck.nameEn, truck.nameAr))}</b><h2>${esc(o.orderNo)}</h2><div>${esc(fmtDateTime(o.createdAt, lang))}</div></div><hr>
      ${rows}<hr>
      <div class="r"><span>${esc(t("common.subtotal"))}</span><span>${fmtMoney(o.subtotal)}</span></div>
      ${o.deliveryFee ? `<div class="r"><span>${esc(t("checkout.deliveryFee"))}</span><span>${fmtMoney(o.deliveryFee)}</span></div>` : ""}
      <div class="r"><b>${esc(t("common.total"))}</b><b>${fmtMoney(o.total)} ${esc(t("common.currency"))}</b></div>
      <div class="c" style="margin-top:8px">${esc(t(`pay.${o.paymentMethod}`))} · ${esc(t(`pay.status.${o.paymentStatus}`))}</div>
      <div class="c" style="margin-top:6px">${esc(t("common.poweredBy"))}</div>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="h-10 w-auto rounded-md" />}
        <div className="flex-1">
          <div className="font-black">
            {t("pos.title")} · {truck.emoji} {L(truck.nameEn, truck.nameAr)}
          </div>
          <div className="text-xs text-muted">{staffName}</div>
        </div>
        <LangSwitch />
        <LogoutButton label={t("login.logout")} />
      </header>

      <div className="grid flex-1 gap-4 p-3 lg:grid-cols-[1fr_26rem]">
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input className="input sm:max-w-56" placeholder={t("store.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              <button className={`tab ${!cat ? "tab-active" : ""}`} onClick={() => setCat(0)}>
                {t("store.all")}
              </button>
              {data.categories.map((c) => (
                <button key={c.id} className={`tab ${cat === c.id ? "tab-active" : ""}`} onClick={() => setCat(c.id)}>
                  {L(c.nameEn, c.nameAr)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((i) => (
              <button
                key={i.id}
                disabled={!i.inStock}
                className="card group overflow-hidden text-start transition hover:border-accent active:scale-[0.98] disabled:opacity-40"
                onClick={() => (i.ingredients.length ? setModal(i) : cart.add({ itemId: i.id, qty: 1, removed: [], extras: [] }))}
              >
                <Img src={i.imageUrl} emoji={i.emoji || "🍽️"} className="h-28 w-full" />
                <div className="p-2.5">
                  <div className="line-clamp-2 min-h-[2.4em] text-sm font-extrabold leading-tight">{L(i.nameEn, i.nameAr)}</div>
                  <div className="mt-1 font-black text-accent">{money(i.price)}</div>
                </div>
              </button>
            ))}
          </div>

          <h3 className="mb-2 mt-8 font-bold text-muted">{t("pos.recent")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((o) => (
              <div key={o.id} className="card-2 flex items-center gap-3 p-3 text-sm">
                <div className="flex-1">
                  <b>{o.orderNo}</b> <span className={`chip ${o.status === "COMPLETED" ? "chip-good" : o.status === "CANCELLED" ? "chip-bad" : "chip-accent"}`}>{t(`orders.status.${o.status}`)}</span>
                  <div className="text-xs text-muted">
                    {o.items.reduce((s, l) => s + l.qty, 0)} {t("common.items")} · {money(o.total)}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => print(o)}>
                  🧾 {t("pos.print")}
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="card glow flex flex-col gap-3 p-4 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="h-title">{t("store.cart")}</h2>
            {lines.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={cart.clear}>
                {t("pos.clear")}
              </button>
            )}
          </div>
          {lines.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("pos.empty")}</p>}
          {lines.map((l) => {
            const it = itemMap.get(l.itemId)!;
            return (
              <div key={l.key} className="card-2 flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{L(it.nameEn, it.nameAr)}</div>
                  {(l.removed.length > 0 || l.extras.length > 0) && <div className="text-xs text-muted">{optionText(it, l, L, "−")}</div>}
                  <div className="text-xs font-bold text-accent">{money(lineUnit(it, l.extras) * l.qty)}</div>
                </div>
                <Stepper value={l.qty} onChange={(v) => cart.setQty(l.key, v)} />
              </div>
            );
          })}

          <div className="grid grid-cols-3 gap-1.5">
            {(["dine_in", "pickup", "delivery"] as const).map((x) => (
              <button key={x} className={`btn btn-sm ${type === x ? "btn-primary" : "btn-ghost"}`} onClick={() => setType(x)}>
                {x === "dine_in" ? t("pos.dineIn") : x === "pickup" ? t("pos.pickup") : t("pos.delivery")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder={t("pos.customer")} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" type="tel" placeholder={t("common.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {type === "delivery" && (
            <>
              <select className="input" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">{t("common.region")}…</option>
                {data.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {L(r.nameEn, r.nameAr)} — {money(r.fee)}
                  </option>
                ))}
              </select>
              <input className="input" placeholder={t("common.address")} value={address} onChange={(e) => setAddress(e.target.value)} />
            </>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {(["cash", "benefit", "card"] as const).map((m) => (
              <button key={m} className={`btn btn-sm ${method === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setMethod(m)}>
                {m === "cash" ? "💵" : m === "benefit" ? "📲" : "💳"} {t(`pay.${m}`).split(" ")[0]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={paid || method === "card"} disabled={method === "card"} onChange={(e) => setPaid(e.target.checked)} /> {t("pos.paymentStatus")}
          </label>
          <input className="input" placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="space-y-1 border-t border-line pt-3">
            {fee > 0 && (
              <div className="flex justify-between text-sm text-muted">
                <span>{t("checkout.deliveryFee")}</span>
                <span>{money(fee)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-black">
              <span>{t("common.total")}</span>
              <span className="text-accent">{money(subtotal + fee)}</span>
            </div>
          </div>
          <button className="btn btn-primary w-full py-3 text-base" disabled={busy || lines.length === 0 || (type === "delivery" && !regionId)} onClick={send}>
            🔥 {t("pos.place")}
          </button>
        </aside>
      </div>

      {modal && (
        <ItemModal
          item={modal}
          unavailable={false}
          onClose={() => setModal(null)}
          onAdd={(l) => {
            cart.add(l);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
