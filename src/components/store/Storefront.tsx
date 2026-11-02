"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { fmtTime12 } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { Img, Modal, Stepper, toast } from "@/components/ui";
import { LangSwitch, useLocalized, useMoney, useSite, useT } from "@/components/I18n";
import AuthModal from "./AuthModal";
import Checkout from "./Checkout";
import { AccountTab, OrdersTab } from "./OrdersAccount";
import Subscribe from "./Subscribe";
import { lineUnit, optionText, useCart, useGuestRefs, type Customer, type StoreData, type StoreItem } from "./shared";

type Tab = "menu" | "subscribe" | "orders" | "account";

export default function Storefront({ initial, initialCustomer }: { initial: StoreData; initialCustomer: Customer | null }) {
  const t = useT();
  const L = useLocalized();
  const money = useMoney();
  const { settings, lang } = useSite();
  const [data, setData] = useState(initial);
  const [customer, setCustomer] = useState(initialCustomer);
  const [tab, setTab] = useState<Tab>("menu");
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [itemModal, setItemModal] = useState<StoreItem | null>(null);
  const [placed, setPlaced] = useState<OrderView | null>(null);
  const [popup, setPopup] = useState<StoreData["banners"][number] | null>(null);
  const [ordersKey, setOrdersKey] = useState(0);

  const truck = data.truck;
  const cart = useCart(truck.slug);
  const refs = useGuestRefs(truck.slug);
  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ data: StoreData }>(`/api/public/${truck.slug}`);
      setData(r.data);
    } catch {}
  }, [truck.slug]);

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("pay") === "return") {
      toast(`${t("pay.status.pending")} · ${p.get("order") ?? ""}`);
      setTab("orders");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const b = data.banners.find((x) => x.kind === "popup");
    if (b && !sessionStorage.getItem(`st-popup-${b.id}`)) setPopup(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validLines = cart.lines.filter((l) => itemMap.has(l.itemId));
  const cartCount = validLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = validLines.reduce((s, l) => s + lineUnit(itemMap.get(l.itemId)!, l.extras) * l.qty, 0);
  const orderable = data.open.open;

  const stampsHere = customer?.loyalty[String(truck.id)] ?? 0;
  const th = Math.max(1, truck.loyaltyThreshold);
  const credits = Math.floor(stampsHere / th);

  const filtered = data.items.filter((i) => {
    if (cat && i.categoryId !== cat) return false;
    const s = q.trim().toLowerCase();
    return !s || i.nameEn.toLowerCase().includes(s) || i.nameAr.includes(s);
  });

  const statusKey = !data.open.open ? "closed" : data.open.busy ? "busy" : "open";
  const banner =
    data.open.reason === "closed" ? t("store.closedBanner") : data.open.reason === "holiday" ? t("store.holidayBanner") : data.open.reason === "hours" ? t("store.hoursBanner") : data.open.busy ? t("store.busyBanner") : "";

  const quickAdd = (i: StoreItem) => {
    cart.add({ itemId: i.id, qty: 1, removed: [], extras: [] });
    toast(`${L(i.nameEn, i.nameAr)} ✓`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "menu", label: t("store.tab.menu") },
    { id: "subscribe", label: t("store.tab.subscribe") },
    { id: "orders", label: t("store.tab.orders") },
    { id: "account", label: t("store.tab.account") },
  ];

  return (
    <div className="min-h-dvh pb-28">
      {/* hero + header */}
      <div
        className="relative"
        style={
          truck.heroImageUrl || settings.heroBgUrl
            ? { background: `linear-gradient(rgba(0,0,0,.55), var(--bg)), url(${truck.heroImageUrl || settings.heroBgUrl}) center/cover` }
            : { background: "radial-gradient(50rem 20rem at 50% -20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent)" }
        }
      >
        <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-6">
            <Link href="/" className="btn btn-ghost btn-sm" aria-label="home">
              <span className="inline-block rtl:rotate-180">←</span>
            </Link>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="hidden h-10 w-auto rounded-md sm:block" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-black leading-tight sm:text-lg">
                {truck.emoji} {L(truck.nameEn, truck.nameAr)}
              </div>
              <button type="button" onClick={() => setHoursOpen(true)} className={`chip mt-0.5 ${statusKey === "open" ? "chip-good" : statusKey === "busy" ? "chip-accent" : "chip-bad"}`}>
                ● {t(`landing.status.${statusKey}`)} · 🕒
              </button>
            </div>
            <LangSwitch />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (customer ? setTab("account") : setAuthOpen(true))}>
              👤 <span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : t("store.login")}</span>
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCartOpen(true)}>
              🛒 {cartCount > 0 && <span>{cartCount}</span>}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-3 pb-4 pt-6 sm:px-6">
          <h1 className="h-display !text-[clamp(1.8rem,1rem+3vw,3rem)]">{L(truck.nameEn, truck.nameAr)}</h1>
          <p className="mt-1 text-muted">{L(truck.taglineEn, truck.taglineAr)}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 sm:px-6">
        {banner && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${data.open.open ? "chip-accent" : "chip-bad"}`} style={{ whiteSpace: "normal" }}>
            {data.open.open ? "⏳" : "⛔"} {banner}
          </div>
        )}
        {data.banners
          .filter((b) => b.kind === "banner")
          .map((b) => (
            <div key={b.id} className="card mb-4 flex items-center gap-4 overflow-hidden p-0">
              {b.imageUrl && <Img src={b.imageUrl} className="h-24 w-32 shrink-0" />}
              <div className="p-3">
                <div className="font-black text-accent">{L(b.titleEn, b.titleAr)}</div>
                <div className="text-sm text-muted">{L(b.bodyEn, b.bodyAr)}</div>
              </div>
            </div>
          ))}

        <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((x) => (
            <button key={x.id} className={`tab ${tab === x.id ? "tab-active" : ""}`} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </nav>

        {tab === "menu" && (
          <>
            {settings.loyaltyEnabled && customer && (
              <div className="card mb-5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>🎟️ {t("store.loyaltyTitle")}</b>
                  <span className="chip chip-accent">{t("store.loyaltyProgress", { n: stampsHere % th, total: th })}</span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  {Array.from({ length: th }).map((_, i) => (
                    <span key={i} className={`h-2.5 flex-1 rounded-full ${i < stampsHere % th ? "bg-accent" : ""}`} style={i >= stampsHere % th ? { background: "rgba(255,255,255,.12)" } : undefined} />
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted">{credits > 0 ? <b className="text-accent">🎁 {t("store.loyaltyReady", { n: credits })}</b> : t("store.loyaltyHint", { total: th })}</p>
              </div>
            )}

            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <input className="input sm:max-w-xs" placeholder={t("store.search")} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
                <button className={`tab ${cat === 0 ? "tab-active" : ""}`} onClick={() => setCat(0)}>
                  {t("store.all")}
                </button>
                {data.categories.map((c) => (
                  <button key={c.id} className={`tab flex items-center gap-1.5 ${cat === c.id ? "tab-active" : ""} ${!c.availableNow ? "opacity-60" : ""}`} onClick={() => setCat(c.id)}>
                    {c.imageUrl && <Img src={c.imageUrl} className="h-5 w-5 rounded-full" />}
                    {L(c.nameEn, c.nameAr)}
                  </button>
                ))}
              </div>
            </div>

            {truck.minOrder > 0 && <p className="mb-3 text-xs text-muted">{t("store.minOrder", { amount: money(truck.minOrder) })}</p>}

            {data.categories.map((c) => {
              const list = filtered.filter((i) => i.categoryId === c.id);
              if (!list.length) return null;
              return (
                <section key={c.id} className="mb-8">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="h-title">{L(c.nameEn, c.nameAr)}</h2>
                    {c.timeFrom && c.timeTo && (
                      <span className={`chip ${c.availableNow ? "chip-good" : "chip-bad"}`}>
                        {t("store.availableBetween", { from: fmtTime12(c.timeFrom), to: fmtTime12(c.timeTo) })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((i) => {
                      const unavailable = !c.availableNow || !i.inStock;
                      return (
                        <article key={i.id} className={`card group flex overflow-hidden transition hover:border-accent/60 ${unavailable ? "opacity-60" : ""}`}>
                          <button type="button" className="relative w-32 shrink-0 sm:w-36" onClick={() => setItemModal(i)}>
                            <Img src={i.imageUrl} emoji={i.emoji || "🍽️"} alt={L(i.nameEn, i.nameAr)} className="h-full min-h-32 w-full transition duration-500 group-hover:scale-105" />
                            {!i.inStock && <span className="chip chip-bad absolute start-2 top-2">{t("store.soldOut")}</span>}
                          </button>
                          <div className="flex min-w-0 flex-1 flex-col p-3">
                            <button type="button" className="text-start" onClick={() => setItemModal(i)}>
                              <h3 className="font-extrabold leading-snug">{L(i.nameEn, i.nameAr)}</h3>
                              {(i.descEn || i.descAr) && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{L(i.descEn, i.descAr)}</p>}
                            </button>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {i.tags.includes("spicy") && <span className="chip chip-bad">🌶️ {t("store.spicy")}</span>}
                              {i.tags.includes("fresh") && <span className="chip chip-good">🌿 {t("store.fresh")}</span>}
                            </div>
                            <div className="mt-auto flex items-center justify-between pt-2">
                              <span className="font-black text-accent">{money(i.price)}</span>
                              {i.ingredients.length > 0 ? (
                                <button className="btn btn-primary btn-sm" disabled={unavailable} onClick={() => setItemModal(i)}>
                                  {t("store.customize")}
                                </button>
                              ) : (
                                <button className="btn btn-primary btn-sm" disabled={unavailable} onClick={() => quickAdd(i)}>
                                  + {t("store.add")}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filtered.length === 0 && <p className="py-10 text-center text-muted">{t("store.noItems")}</p>}
          </>
        )}

        {tab === "subscribe" && <Subscribe data={data} customer={customer} openAuth={() => setAuthOpen(true)} onCreated={() => { setOrdersKey((k) => k + 1); setTab("orders"); }} />}
        {tab === "orders" && <OrdersTab key={ordersKey} data={data} customer={customer} guestRefs={refs.read} openAuth={() => setAuthOpen(true)} />}
        {tab === "account" && <AccountTab data={data} customer={customer} setCustomer={setCustomer} openAuth={() => setAuthOpen(true)} />}
      </div>

      {/* floating cart bar */}
      {cartCount > 0 && tab === "menu" && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <button className="btn btn-primary pop-in w-full max-w-md justify-between px-5 py-3 text-base" onClick={() => setCartOpen(true)}>
            <span>
              🛒 {t("store.viewCart")} ({cartCount})
            </span>
            <span>{money(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* item modal */}
      {itemModal && (
        <ItemModal
          item={itemModal}
          unavailable={!(catMap.get(itemModal.categoryId)?.availableNow ?? true) || !itemModal.inStock}
          onClose={() => setItemModal(null)}
          onAdd={(line) => {
            cart.add(line);
            setItemModal(null);
            toast(`${L(itemModal.nameEn, itemModal.nameAr)} ✓`);
          }}
        />
      )}

      {/* cart */}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={t("store.cart")}>
        {validLines.length === 0 ? (
          <p className="py-6 text-center text-muted">{t("store.cartEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {validLines.map((l) => {
              const it = itemMap.get(l.itemId)!;
              return (
                <div key={l.key} className="card-2 flex items-center gap-3 p-3">
                  <Img src={it.imageUrl} emoji={it.emoji} className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{L(it.nameEn, it.nameAr)}</div>
                    {(l.removed.length > 0 || l.extras.length > 0) && <div className="text-xs text-muted">{optionText(it, l, L, "−")}</div>}
                    <div className="text-sm font-bold text-accent">{money(lineUnit(it, l.extras) * l.qty)}</div>
                  </div>
                  <Stepper value={l.qty} onChange={(v) => cart.setQty(l.key, v)} />
                </div>
              );
            })}
            <div className="flex justify-between border-t border-line pt-3 text-lg font-black">
              <span>{t("common.subtotal")}</span>
              <span>{money(cartTotal)}</span>
            </div>
            {!orderable && <p className="text-sm font-bold text-bad">{banner}</p>}
            <button
              className="btn btn-primary w-full text-base"
              disabled={!orderable}
              onClick={() => {
                setCartOpen(false);
                setCheckoutOpen(true);
              }}
            >
              {t("store.checkout")}
            </button>
          </div>
        )}
      </Modal>

      {checkoutOpen && (
        <Checkout
          data={data}
          customer={customer}
          lines={validLines}
          onClose={() => setCheckoutOpen(false)}
          openAuth={() => setAuthOpen(true)}
          onPlaced={(o) => {
            if (!customer && o.accessToken) refs.push(o.id, o.accessToken);
            cart.clear();
            setCheckoutOpen(false);
            setPlaced(o);
            setOrdersKey((k) => k + 1);
            if (customer) void api<{ customer: Customer | null }>("/api/auth/customer").then((r) => r.customer && setCustomer(r.customer));
            void refresh();
          }}
        />
      )}

      <Modal open={!!placed} onClose={() => setPlaced(null)} title={t("checkout.successTitle")}>
        {placed && (
          <div className="space-y-4 text-center">
            <div className="text-6xl">✅</div>
            <p className="text-muted">{t("checkout.successDesc", { no: placed.orderNo, minutes: settings.cancelDirectMin })}</p>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setPlaced(null)}>
                {t("checkout.continue")}
              </button>
              <button
                className="btn btn-primary flex-1"
                onClick={() => {
                  setPlaced(null);
                  setTab("orders");
                }}
              >
                {t("checkout.viewOrders")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} regions={data.regions} onAuthed={(c) => { setCustomer(c); toast(`${t("auth.welcome")} ${c.name}`); }} />

      <Modal open={hoursOpen} onClose={() => setHoursOpen(false)} title={t("store.hoursTitle")}>
        <div className="space-y-2">
          {truck.hours.map((h, d) => (
            <div key={d} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <b>{t(`day.${d}`)}</b>
              <span className={h.closed ? "font-bold text-bad" : "text-muted"}>
                {h.closed ? t("store.closedDay") : h.shifts.map((s) => `${fmtTime12(s.from)} – ${fmtTime12(s.to)}`).join("  ·  ")}
              </span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!popup}
        onClose={() => {
          if (popup) sessionStorage.setItem(`st-popup-${popup.id}`, "1");
          setPopup(null);
        }}
        title={popup ? L(popup.titleEn, popup.titleAr) : ""}
      >
        {popup && (
          <div className="space-y-3">
            {popup.imageUrl && <Img src={popup.imageUrl} className="max-h-64 w-full rounded-xl" />}
            <p className="text-muted">{L(popup.bodyEn, popup.bodyAr)}</p>
            <button
              className="btn btn-primary w-full"
              onClick={() => {
                sessionStorage.setItem(`st-popup-${popup.id}`, "1");
                setPopup(null);
              }}
            >
              {t("landing.cta")}
            </button>
          </div>
        )}
      </Modal>
      <span className="hidden">{lang}</span>
    </div>
  );
}

export function ItemModal({
  item,
  unavailable,
  onClose,
  onAdd,
}: {
  item: StoreItem;
  unavailable: boolean;
  onClose: () => void;
  onAdd: (l: { itemId: number; qty: number; removed: number[]; extras: number[] }) => void;
}) {
  const t = useT();
  const L = useLocalized();
  const money = useMoney();
  const [removed, setRemoved] = useState<number[]>([]);
  const [extras, setExtras] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const toggle = (arr: number[], set: (a: number[]) => void, i: number) => set(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]);
  const included = item.ingredients.map((g, i) => ({ g, i })).filter((x) => x.g.addPrice <= 0);
  const addons = item.ingredients.map((g, i) => ({ g, i })).filter((x) => x.g.addPrice > 0);

  return (
    <Modal open onClose={onClose} title={L(item.nameEn, item.nameAr)}>
      <div className="space-y-4">
        <Img src={item.imageUrl} emoji={item.emoji || "🍽️"} className="h-52 w-full rounded-2xl" />
        <div className="flex flex-wrap gap-1.5">
          {item.tags.includes("spicy") && <span className="chip chip-bad">🌶️ {t("store.spicy")}</span>}
          {item.tags.includes("fresh") && <span className="chip chip-good">🌿 {t("store.fresh")}</span>}
        </div>
        {(item.descEn || item.descAr) && <p className="text-muted">{L(item.descEn, item.descAr)}</p>}

        {included.length > 0 && (
          <section>
            <h4 className="text-sm font-bold">{t("store.ingredients")}</h4>
            <p className="mb-2 text-xs text-muted">{t("store.removeHint")}</p>
            <div className="flex flex-wrap gap-2">
              {included.map(({ g, i }) => {
                const off = removed.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!g.removable}
                    onClick={() => toggle(removed, setRemoved, i)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${off ? "border-bad/50 text-muted line-through" : "border-line"} ${g.removable ? "cursor-pointer hover:border-accent" : "cursor-default opacity-80"}`}
                  >
                    {g.imageUrl && <Img src={g.imageUrl} className="h-5 w-5 rounded-full" />}
                    {L(g.nameEn, g.nameAr)}
                    {g.removable && <span className="text-xs">{off ? "＋" : "✕"}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {addons.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-bold">{t("store.extras")}</h4>
            <div className="space-y-2">
              {addons.map(({ g, i }) => (
                <label key={i} className={`card-2 flex cursor-pointer items-center gap-3 p-2.5 ${extras.includes(i) ? "border-accent" : ""}`}>
                  <input type="checkbox" checked={extras.includes(i)} onChange={() => toggle(extras, setExtras, i)} />
                  {g.imageUrl && <Img src={g.imageUrl} className="h-8 w-8 rounded-lg" />}
                  <span className="flex-1 font-semibold">{L(g.nameEn, g.nameAr)}</span>
                  <span className="font-bold text-accent">+{money(g.addPrice)}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between gap-3">
          <Stepper value={qty} min={1} onChange={setQty} />
          <button className="btn btn-primary flex-1" disabled={unavailable} onClick={() => onAdd({ itemId: item.id, qty, removed, extras })}>
            {unavailable ? t("store.unavailable") : `${t("store.addToCart")} · ${money(lineUnit(item, extras) * qty)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
