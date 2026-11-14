"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { bhParts, toMin } from "@/lib/time";
import { Modal, Img, toast } from "@/components/ui";
import { useErr, useLocalized, useMoney, useSite, useT } from "@/components/I18n";
import type { OrderView } from "@/lib/types";
import { toCartInput, type CartLine, type Customer, type StoreData } from "./shared";

type Pricing = { subtotal: number; loyaltyDiscount: number; couponDiscount: number; couponCode: string; deliveryFee: number; total: number };

export default function Checkout({
  data,
  customer,
  lines,
  onClose,
  onPlaced,
  openAuth,
}: {
  data: StoreData;
  customer: Customer | null;
  lines: CartLine[];
  onClose: () => void;
  onPlaced: (o: OrderView) => void;
  openAuth: () => void;
}) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const money = useMoney();
  const { settings } = useSite();
  const truck = data.truck;

  const [asGuest, setAsGuest] = useState(!customer);
  useEffect(() => {
    if (!customer) setAsGuest(true);
  }, [customer]);
  const [guest, setGuest] = useState({ name: "", phone: "", email: "" });
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const hasDefault = !!customer && !asGuest && !!customer.address;
  const defRegion = customer ? data.regions.find((r) => r.nameEn.toLowerCase() === customer.regionName.toLowerCase())?.id : undefined;
  const [addrMode, setAddrMode] = useState<"default" | "other">(hasDefault ? "default" : "other");
  const [regionId, setRegionId] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [slotId, setSlotId] = useState("");
  const [method, setMethod] = useState<"cash" | "benefit" | "card">(truck.pay.cash ? "cash" : truck.pay.benefit ? "benefit" : "card");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<Pricing | null>(null);
  const [qErr, setQErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAddrMode(hasDefault ? "default" : "other");
  }, [hasDefault]);
  useEffect(() => {
    if (addrMode === "default" && customer) {
      setRegionId(defRegion ? String(defRegion) : "");
      setAddress(customer.address);
    } else {
      setAddress((a) => (customer && a === customer.address ? "" : a));
    }
  }, [addrMode, customer, defRegion]);

  const nowMin = bhParts().minutes;
  const slots = useMemo(() => truck.slots.filter((s) => toMin(s.to) <= toMin(s.from) || nowMin < toMin(s.to)), [truck.slots, nowMin]);
  const credits = customer && !asGuest ? Math.floor((customer.loyalty[String(truck.id)] ?? 0) / Math.max(1, truck.loyaltyThreshold)) : 0;
  const cartInput = useMemo(() => toCartInput(lines), [lines]);

  useEffect(() => {
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const r = await api<{ pricing: Pricing }>("/api/orders", {
          body: { truck: truck.slug, dryRun: true, cart: cartInput, fulfillment, regionId: Number(regionId) || null, lat, lng, coupon, useLoyalty: useLoyalty && credits > 0, asGuest },
        });
        if (alive) {
          setQuote(r.pricing);
          setQErr("");
        }
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (!alive) return;
        setQuote(null);
        setQErr(err(code));
        if (code === "invalid_coupon") setCoupon("");
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [cartInput, fulfillment, regionId, lat, lng, coupon, useLoyalty, credits, asGuest, truck.slug, err]);

  const place = async () => {
    if (asGuest && (!guest.name.trim() || guest.phone.replace(/\D/g, "").length < 7)) return toast(err("contact_required"), "err");
    if (fulfillment === "delivery" && (!lat || !lng)) return toast("Please select your delivery location on the map / GPS", "err");
    setBusy(true);
    try {
      const r = await api<{ order: OrderView; paymentUrl?: string }>("/api/orders", {
        body: {
          truck: truck.slug,
          cart: cartInput,
          fulfillment,
          regionId: Number(regionId) || null,
          address,
          lat,
          lng,
          slotId: slotId || "ASAP",
          paymentMethod: method,
          coupon,
          useLoyalty: useLoyalty && credits > 0,
          asGuest,
          guest,
          notes,
        },
      });
      if (r.paymentUrl) {
        toast(t("checkout.payCardRedirect"));
        window.location.href = r.paymentUrl;
        return;
      }
      onPlaced(r.order);
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    } finally {
      setBusy(false);
    }
  };

  const methods = [
    truck.pay.cash && { id: "cash" as const, label: t("pay.cash"), desc: t("pay.cashDesc"), icon: "💵" },
    truck.pay.benefit && { id: "benefit" as const, label: t("pay.benefit"), desc: t("pay.benefitDesc"), icon: "📲" },
    truck.pay.card && { id: "card" as const, label: t("pay.card"), desc: t("pay.cardDesc"), icon: "💳" },
  ].filter(Boolean) as { id: "cash" | "benefit" | "card"; label: string; desc: string; icon: string }[];

  const Row = ({ k, v, strong, good }: { k: string; v: string; strong?: boolean; good?: boolean }) => (
    <div className={`flex justify-between ${strong ? "text-lg font-black" : "text-sm"} ${good ? "text-good" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{k}</span>
      <span>{v}</span>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={t("checkout.title")} wide>
      <div className="space-y-5">
        {/* order as */}
        <section>
          <h4 className="mb-2 text-sm font-bold text-muted">{t("checkout.orderAs")}</h4>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`btn btn-sm ${asGuest ? "btn-primary" : "btn-ghost"}`} onClick={() => setAsGuest(true)}>
              👤 {t("checkout.guest")}
            </button>
            {customer ? (
              <button type="button" className={`btn btn-sm ${!asGuest ? "btn-primary" : "btn-ghost"}`} onClick={() => setAsGuest(false)}>
                ⭐ {t("checkout.account")} · {customer.name}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={openAuth}>
                {t("auth.login")} / {t("auth.register")}
              </button>
            )}
          </div>
          {asGuest && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input className="input" placeholder={t("common.name")} value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              <input className="input" type="tel" placeholder={t("common.phone")} value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              <p className="text-xs text-muted sm:col-span-2">{t("checkout.guestHint")}</p>
            </div>
          )}
        </section>

        {/* fulfillment */}
        <section>
          <h4 className="mb-2 text-sm font-bold text-muted">{t("checkout.fulfillment")}</h4>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`btn ${fulfillment === "delivery" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFulfillment("delivery")}>
              🛵 {t("checkout.delivery")}
            </button>
            <button type="button" className={`btn ${fulfillment === "pickup" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFulfillment("pickup")}>
              🏪 {t("checkout.pickup")}
            </button>
          </div>

          {fulfillment === "delivery" && (
            <div className="mt-3 space-y-3">
              {customer && !asGuest && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`card-2 flex cursor-pointer items-start gap-2 p-3 ${addrMode === "default" ? "border-accent" : ""} ${!customer.address ? "opacity-50" : ""}`}>
                    <input type="radio" disabled={!customer.address} checked={addrMode === "default"} onChange={() => setAddrMode("default")} />
                    <span className="text-sm">
                      <b>{t("checkout.useDefaultAddress")}</b>
                      <span className="block text-muted">{customer.address ? `${customer.regionName} · ${customer.address}` : t("checkout.noDefaultAddress")}</span>
                    </span>
                  </label>
                  <label className={`card-2 flex cursor-pointer items-center gap-2 p-3 ${addrMode === "other" ? "border-accent" : ""}`}>
                    <input type="radio" checked={addrMode === "other"} onChange={() => setAddrMode("other")} />
                    <b className="text-sm">{t("checkout.useOtherAddress")}</b>
                  </label>
                </div>
              )}
              <select className="input" value={regionId} onChange={(e) => setRegionId(e.target.value)} disabled={addrMode === "default" && !!defRegion}>
                <option value="">{t("common.region")}…</option>
                {data.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {L(r.nameEn, r.nameAr)} — {money(r.fee)}
                  </option>
                ))}
              </select>
              <textarea className="input" rows={2} placeholder={t("common.address")} value={address} disabled={addrMode === "default" && hasDefault} onChange={(e) => setAddress(e.target.value)} />
              
              <div className="card-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">📍 Delivery Location (Required)</span>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        toast("Geolocation is not supported by your browser", "err");
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setLat(pos.coords.latitude);
                          setLng(pos.coords.longitude);
                          toast("Location pinned successfully! ✓");
                        },
                        (err) => {
                          toast("Unable to retrieve your location. Please check browser permissions.", "err");
                        },
                        { enableHighAccuracy: true }
                      );
                    }}
                  >
                    🎯 Use GPS Location
                  </button>
                </div>
                {lat && lng ? (
                  <p className="text-xs text-good font-mono">
                    ✓ Pinned: {lat.toFixed(5)}, {lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-xs text-bad">
                    ⚠️ Map location selection is mandatory for delivery orders. Please click "Use GPS Location".
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Slots hidden for direct orders */}
        </section>

        {/* payment */}
        <section>
          <h4 className="mb-2 text-sm font-bold text-muted">{t("checkout.payment")}</h4>
          <div className="space-y-2">
            {methods.map((m) => (
              <label key={m.id} className={`card-2 flex cursor-pointer items-start gap-3 p-3 ${method === m.id ? "border-accent" : ""}`}>
                <input type="radio" className="mt-1" checked={method === m.id} onChange={() => setMethod(m.id)} />
                <span className="text-sm">
                  <b>
                    {m.icon} {m.label}
                  </b>
                  <span className="block text-muted">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {method === "benefit" && (
            <div className="card-2 mt-3 flex flex-wrap items-center gap-4 p-4">
              {truck.pay.benefitQrUrl && <Img src={truck.pay.benefitQrUrl} alt="BenefitPay QR" className="h-40 w-40 rounded-xl bg-white object-contain p-2" />}
              <div className="space-y-1 text-sm">
                {truck.pay.benefitIban && (
                  <p>
                    <span className="text-muted">{t("pay.benefitIban")}: </span>
                    <b className="select-all font-mono">{truck.pay.benefitIban}</b>
                  </p>
                )}
                {truck.pay.benefitName && (
                  <p>
                    <span className="text-muted">{t("pay.benefitName")}: </span>
                    <b>{truck.pay.benefitName}</b>
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* promo + loyalty */}
        <section className="space-y-3">
          <div className="flex gap-2">
            <input className="input" placeholder={t("checkout.coupon")} value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
            <button type="button" className="btn btn-soft" onClick={() => setCoupon(couponInput.trim())}>
              {t("checkout.applyCoupon")}
            </button>
          </div>
          {quote?.couponCode && <p className="text-sm font-bold text-good">✓ {t("checkout.couponApplied")}: {quote.couponCode}</p>}
          {settings.loyaltyEnabled && credits > 0 && (
            <label className="card-2 flex cursor-pointer items-center gap-2 p-3 text-sm font-bold text-accent">
              <input type="checkbox" checked={useLoyalty} onChange={(e) => setUseLoyalty(e.target.checked)} />
              🎁 {t("checkout.useLoyalty")} ({credits})
            </label>
          )}
          <textarea className="input" rows={2} placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        {/* summary */}
        <section className="card-2 space-y-1.5 p-4">
          {quote ? (
            <>
              <Row k={t("common.subtotal")} v={money(quote.subtotal)} />
              {fulfillment === "delivery" && <Row k={t("checkout.deliveryFee")} v={money(quote.deliveryFee)} />}
              {quote.loyaltyDiscount > 0 && <Row k={t("checkout.sumLoyalty")} v={`- ${money(quote.loyaltyDiscount)}`} good />}
              {quote.couponDiscount > 0 && <Row k={t("checkout.sumCoupon")} v={`- ${money(quote.couponDiscount)}`} good />}
              <div className="my-2 border-t border-line" />
              <Row k={t("common.total")} v={money(quote.total)} strong />
            </>
          ) : (
            <p className="text-sm font-semibold text-bad">{qErr || t("common.loading")}</p>
          )}
        </section>

        <button className="btn btn-primary w-full text-base" disabled={busy || !quote || !data.open.open} onClick={place}>
          {busy ? t("checkout.placing") : `${t("checkout.place")} · ${quote ? money(quote.total) : ""}`}
        </button>
      </div>
    </Modal>
  );
}