"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, beep, unlockAudio } from "@/lib/client";
import { bhParts, fmtDateTime } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { LogoutButton, toast } from "@/components/ui";
import { LangSwitch, useErr, useLocalized, useSite, useT } from "@/components/I18n";

const HOUR = 3600_000;

export default function KitchenDisplay({ slug, nameEn, nameAr }: { slug: string; nameEn: string; nameAr: string }) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const { settings, lang } = useSite();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [done, setDone] = useState<OrderView[]>([]);
  const [view, setView] = useState<"all" | "split">("all");
  const [sound, setSound] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<Record<number, number>>({});
  const lastBucket = useRef<Map<number, number>>(new Map());

  const load = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderView[]; completed: OrderView[]; now: string }>(`/api/kitchen/${slug}/orders?completed=${showDone ? 1 : 0}`);
      setOrders(r.orders);
      setDone(r.completed);
      setSkew(Date.parse(r.now) - Date.now());
    } catch {}
  }, [slug, showDone]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + skew;
  const alertStart = (o: OrderView) => (o.kind === "subscription" && o.scheduledFor ? new Date(o.scheduledFor).getTime() - HOUR : new Date(o.createdAt).getTime());
  const intervalMs = (o: OrderView) => (o.kind === "subscription" ? settings.subAlertMin : settings.directAlertMin) * 60_000;

  // Alert engine: direct orders ring every N minutes from creation; subscriptions every M minutes starting 1h before delivery.
  useEffect(() => {
    let ring = false;
    const flashes: Record<number, number> = {};
    for (const o of orders) {
      const start = alertStart(o);
      if (serverNow < start) continue;
      const bucket = Math.floor((serverNow - start) / intervalMs(o));
      if (lastBucket.current.get(o.id) !== bucket) {
        lastBucket.current.set(o.id, bucket);
        flashes[o.id] = Date.now() + 9000;
        ring = true;
      }
    }
    if (ring) {
      if (sound) beep(3);
      setFlash((f) => ({ ...f, ...flashes }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverNow, orders, sound]);

  const complete = async (o: OrderView) => {
    setOrders((cur) => cur.filter((x) => x.id !== o.id));
    try {
      await api(`/api/kitchen/${slug}/orders`, { body: { orderId: o.id } });
    } catch (e) {
      toast(err((e as { code?: string }).code), "err");
    }
    void load();
  };

  const enableSound = () => {
    if (unlockAudio()) {
      setSound(true);
      beep(2);
    }
  };

  const effective = (o: OrderView) => new Date(o.scheduledFor ?? o.createdAt).getTime();
  const sorted = [...orders].sort((a, b) => effective(a) - effective(b));
  const direct = sorted.filter((o) => o.kind !== "subscription");
  const subs = sorted.filter((o) => o.kind === "subscription");
  const alertingCount = orders.filter((o) => (flash[o.id] ?? 0) > now).length;

  const renderCard = (o: OrderView, finished?: boolean) => {
    const alerting = !finished && (flash[o.id] ?? 0) > now;
    const start = alertStart(o);
    const waiting = Math.max(0, Math.floor((serverNow - new Date(o.createdAt).getTime()) / 60000));
    return (
      <article key={o.id} className={`card flex flex-col gap-2 p-4 ${alerting ? "alerting" : ""} ${finished ? "opacity-60" : ""}`} style={{ borderWidth: 2 }}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-2xl font-black">{o.orderNo}</b>
          <span className={`chip ${o.kind === "subscription" ? "chip-accent" : ""}`}>{t(`orders.kind.${o.kind}`)}</span>
          <span className="chip">
            {o.fulfillment === "delivery" ? "🛵" : o.fulfillment === "pickup" ? "🏪" : "🧍"} {t(`kds.fulfillment.${o.fulfillment}`)}
            {o.deliverySlot ? ` · ${o.deliverySlot}` : ""}
          </span>
          <span className={`chip ${finished ? "chip-good" : "chip-bad"}`}>{finished ? t("kds.completed") : t("kds.notReady")}</span>
          {o.paymentStatus === "pending" && o.paymentMethod !== "cash" && <span className="chip">{t(`pay.${o.paymentMethod}`).split(" ")[0]}</span>}
        </div>

        {o.kind === "subscription" && o.scheduledFor ? (
          <div className="rounded-lg bg-accent/15 px-3 py-1.5 text-sm font-bold text-accent">
            📅 {t("kds.deliverAt", { when: fmtDateTime(o.scheduledFor, lang) })}
            {serverNow < start && <span className="block text-xs font-semibold text-muted">⏰ {t("kds.alertStarts", { when: fmtDateTime(new Date(start).toISOString(), lang) })}</span>}
          </div>
        ) : (
          <div className="text-xs text-muted">{t("kds.ago", { n: waiting })}</div>
        )}

        <ul className="space-y-1.5 border-y border-line py-2">
          {o.items.map((l, i) => (
            <li key={i}>
              <div className="flex gap-2 text-lg font-extrabold leading-tight">
                <span className="text-accent">{l.qty}×</span>
                <span>{L(l.nameEn, l.nameAr)}</span>
              </div>
              {(l.removedNames.length > 0 || l.extraNames.length > 0) && (
                <div className="ms-8 text-sm font-semibold">
                  {l.removedNames.map((r, k) => (
                    <span key={`r${k}`} className="me-2 text-bad">
                      − {L(r.en, r.ar)}
                    </span>
                  ))}
                  {l.extraNames.map((r, k) => (
                    <span key={`e${k}`} className="me-2 text-good">
                      + {L(r.en, r.ar)}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {o.notes && <p className="rounded-lg bg-black/30 px-3 py-1.5 text-sm">📝 {o.notes}</p>}
        <div className="text-xs text-muted">
          {o.customerName ?? ""} {o.customerPhone ? `· ${o.customerPhone}` : ""}
          {o.fulfillment === "delivery" && o.address ? ` · ${o.regionName} · ${o.address}` : ""}
        </div>
        {!finished && (
          <button className="btn btn-primary mt-1 py-3 text-base" onClick={() => complete(o)}>
            ✅ {t("kds.complete")}
          </button>
        )}
      </article>
    );
  };

  const groupByDate = (list: OrderView[]) => {
    const g: Record<string, OrderView[]> = {};
    for (const o of list) (g[bhParts(new Date(o.scheduledFor ?? o.createdAt)).date] ??= []).push(o);
    return Object.entries(g);
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="h-10 w-auto rounded-md" />}
        <div className="flex-1">
          <div className="font-black">
            {t("kds.title")} · {L(nameEn, nameAr)}
          </div>
          <div className="text-xs text-muted">
            {orders.length} {t("kds.notReady")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`btn btn-sm ${view === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("all")}>
            {t("kds.viewAll")}
          </button>
          <button className={`btn btn-sm ${view === "split" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("split")}>
            {t("kds.viewSplit")}
          </button>
          <label className="flex items-center gap-1.5 text-sm font-semibold">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {t("kds.showCompleted")}
          </label>
          <button className={`btn btn-sm ${sound ? "btn-soft" : "btn-primary"}`} onClick={enableSound}>
            {sound ? `🔔 ${t("kds.soundOn")}` : `🔕 ${t("kds.enableSound")}`}
          </button>
          <LangSwitch />
          <LogoutButton label={t("login.logout")} />
        </div>
      </header>

      {alertingCount > 0 && <div className="alerting bg-bad/15 px-4 py-2 text-center text-sm font-black text-bad">🚨 {alertingCount}</div>}

      <main className="p-3">
        {orders.length === 0 && !showDone && <p className="py-20 text-center text-xl text-muted">{t("kds.empty")}</p>}

        {view === "all" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((o) => renderCard(o))}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <h2 className="h-title mb-3">
                {t("kds.direct")} <span className="chip">{direct.length}</span>
              </h2>
              <div className="grid gap-3 xl:grid-cols-2">
                {direct.map((o) => renderCard(o))}
              </div>
            </section>
            <section>
              <h2 className="h-title mb-3">
                {t("kds.subs")} <span className="chip">{subs.length}</span>
              </h2>
              {groupByDate(subs).map(([date, list]) => (
                <div key={date} className="mb-4">
                  <div className="mb-2 text-sm font-bold text-accent">📅 {date}</div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {list.map((o) => renderCard(o))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {showDone && done.length > 0 && (
          <section className="mt-8">
            <h2 className="h-title mb-3">{t("kds.completed")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {done.map((o) => renderCard(o, true))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
