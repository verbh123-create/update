"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, beep, unlockAudio } from "@/lib/client";
import { bhParts, fmtDateTime } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { LogoutButton, toast } from "@/components/ui";
import { LangSwitch, useErr, useLocalized, useSite, useT } from "@/components/I18n";

const HOUR = 3600_000;

interface Driver {
  id: number;
  name: string;
  phone?: string;
}

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
  
  // حالات إدارة السائقين لطلبات التوصيل وتفاصيل الطلب والتعديل
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [targetOrder, setTargetOrder] = useState<OrderView | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [detailOrder, setDetailOrder] = useState<OrderView | null>(null);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [editableItems, setEditableItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderView[]; completed: OrderView[]; now: string }>(`/api/kitchen/${slug}/orders?completed=${showDone ? 1 : 0}`);
      setOrders(r.orders);
      setDone(r.completed);
      setSkew(Date.parse(r.now) - Date.now());
    } catch {}
  }, [slug, showDone]);

  // جلب قائمة السائقين الخاصين بهذه العربة فقط
  const loadDrivers = useCallback(async () => {
    try {
      const r = await api<{ drivers: Driver[] }>(`/api/kitchen/${slug}/drivers`);
      setDrivers(r.drivers ?? []);
    } catch {}
  }, [slug]);

  useEffect(() => {
    void load();
    void loadDrivers();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load, loadDrivers]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + skew;

  // Alert engine: rings continuously every 5 seconds for any pending unaccepted order
  useEffect(() => {
    if (!sound || orders.length === 0) return;

    beep(3);
    const interval = setInterval(() => {
      if (orders.length > 0) {
        beep(3);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sound, orders.length]);

  // عند الضغط على زر "تم التجهيز"
  const handleCompleteClick = (o: OrderView) => {
    if (o.fulfillment === "delivery") {
      // إذا كان الطلب توصيل، نفتح نافذة اختيار السائق أولاً
      setTargetOrder(o);
      setSelectedDriverId(drivers[0] ? String(drivers[0].id) : "");
    } else {
      // استلام من العربة أو محلي يتم إنجازه مباشرة
      void executeComplete(o.id);
    }
  };

  const executeComplete = async (orderId: number, driverId?: number) => {
    setOrders((cur) => cur.filter((x) => x.id !== orderId));
    setTargetOrder(null);
    try {
      await api(`/api/kitchen/${slug}/orders`, { 
        body: { 
          orderId, 
          driverId: driverId ? Number(driverId) : undefined 
        } 
      });
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
            </li>
          ))}
        </ul>
        {o.notes && <p className="rounded-lg bg-black/30 px-3 py-1.5 text-sm">📝 {o.notes}</p>}
        
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-muted truncate max-w-[200px]">
            {o.customerName ?? ""} {o.customerPhone ? `· ${o.customerPhone}` : ""}
            {o.fulfillment === "delivery" && o.address ? ` · ${o.regionName} · ${o.address}` : ""}
          </div>
          <button 
            type="button" 
            className="btn btn-xs btn-soft shrink-0" 
            onClick={() => {
              setDetailOrder(o);
              setIsEditingItems(false);
              setEditableItems([]);
            }}
          >
            🗺️ التفاصيل والخريطة
          </button>
        </div>

        {!finished && (
          <button className="btn btn-primary mt-1 py-3 text-base" onClick={() => handleCompleteClick(o)}>
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
          <a href={`/pos/${slug}`} className="btn btn-sm btn-soft">
            🖥️ {L("POS", "الكاشير (POS)")}
          </a>
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

      {/* نافذة اختيار السائق لطلبات التوصيل */}
      {targetOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg border-line shadow-2xl">
            <h3 className="text-lg font-black mb-3">🛵 تعيين سائق التوصيل للطلب #{targetOrder.orderNo}</h3>
            <p className="text-sm text-muted mb-4">الرجاء اختيار السائق المسؤول عن توصيل هذا الطلب:</p>
            
            <select 
              className="input w-full mb-5 text-base" 
              value={selectedDriverId} 
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">اختر السائق...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.phone ? `(${d.phone})` : ""}
                </option>
              ))}
            </select>

            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setTargetOrder(null)}>
                إلغاء
              </button>
              <button 
                className="btn btn-primary" 
                disabled={!selectedDriverId}
                onClick={() => executeComplete(targetOrder.id, Number(selectedDriverId))}
              >
                تأكيد التجهيز وإرسال للسائق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل الطلب والخريطة التفاعلية وتعديل الأصناف والإلغاء */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="card w-full max-w-lg p-6 bg-bg border-line shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-xl font-black">📋 تفاصيل الطلب #{detailOrder.orderNo}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setDetailOrder(null)}>✕</button>
            </div>

            <div className="space-y-1 text-sm bg-surface-2 p-3 rounded-xl">
              <p><b>👤 العميل:</b> {detailOrder.customerName || "زائر"}</p>
              <p><b>📞 الهاتف:</b> {detailOrder.customerPhone || "غير متوفر"}</p>
              <p><b>🚚 نوع الطلب:</b> {t(`kds.fulfillment.${detailOrder.fulfillment}`)}</p>
              <p><b>📍 العنوان:</b> {detailOrder.address || "غير محدد"}</p>
              <p><b>🏙️ المنطقة:</b> {detailOrder.regionName || "غير محددة"}</p>
              <p><b>💰 المجموع الكلي:</b> <span className="font-mono text-accent">{detailOrder.total} BHD</span></p>
            </div>

            {/* قائمة المنتجات مع إمكانية التعديل */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm text-muted">🛒 المنتجات المطلوبة:</h4>
                {!isEditingItems ? (
                  <button 
                    type="button" 
                    className="btn btn-xs btn-soft"
                    onClick={() => {
                      setEditableItems(JSON.parse(JSON.stringify(detailOrder.items)));
                      setIsEditingItems(true);
                    }}
                  >
                    ✏️ تعديل الأصناف
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn btn-xs btn-ghost text-accent"
                    onClick={() => setIsEditingItems(false)}
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>

              {!isEditingItems ? (
                <ul className="space-y-2 border border-line rounded-xl p-3">
                  {detailOrder.items.map((l, i) => (
                    <li key={i} className="flex justify-between items-center text-sm font-bold">
                      <span>{l.qty}× {L(l.nameEn, l.nameAr)}</span>
                      <span className="font-mono text-accent">{l.unitPrice * l.qty} BHD</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2 border border-line rounded-xl p-3 bg-surface-2">
                  {editableItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0">
                      <span className="text-sm font-bold flex-1">{L(item.nameEn, item.nameAr)}</span>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button" 
                          className="btn btn-xs btn-soft px-2"
                          onClick={() => {
                            if (item.qty > 1) {
                              const updated = [...editableItems];
                              updated[index].qty -= 1;
                              setEditableItems(updated);
                            }
                          }}
                        >
                          -
                        </button>
                        <span className="font-mono text-sm font-bold">{item.qty}</span>
                        <button 
                          type="button" 
                          className="btn btn-xs btn-soft px-2"
                          onClick={() => {
                            const updated = [...editableItems];
                            updated[index].qty += 1;
                            setEditableItems(updated);
                          }}
                        >
                          +
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-xs btn-ghost text-bad"
                          onClick={() => {
                            setEditableItems(editableItems.filter((_, i) => i !== index));
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm w-full mt-3"
                    onClick={async () => {
                      try {
                        const res = await api<{ order: OrderView }>(`/api/admin/${slug}/orders`, {
                          method: "PATCH",
                          body: { id: detailOrder.id, action: "update_items", items: editableItems }
                        });
                        setDetailOrder(res.order);
                        setIsEditingItems(false);
                        toast("تم تحديث الطلب بنجاح", "good");
                        void load();
                      } catch (e: any) {
                        toast(err(e.code), "err");
                      }
                    }}
                  >
                    حفظ التعديلات على الأصناف
                  </button>
                </div>
              )}
            </div>

            {/* خريطة جوجل التفاعلية لطلبات التوصيل */}
            {detailOrder.fulfillment === "delivery" && (
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-muted">📍 موقع العميل على الخريطة:</h4>
                {detailOrder.lat && detailOrder.lng ? (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-line h-52 w-full bg-surface-2">
                      <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://maps.google.com/maps?q=${detailOrder.lat},${detailOrder.lng}&z=16&output=embed`}
                      ></iframe>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${detailOrder.lat},${detailOrder.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm w-full flex items-center justify-center gap-2"
                    >
                      🗺️ فتح التوجيه في تطبيق خرائط جوجل (Google Maps)
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-bad p-3 bg-bad/10 rounded-xl">⚠️ لم يتم تسجيل إحداثيات GPS لهذا الطلب من قبل العميل.</p>
                )}
              </div>
            )}

            {detailOrder.notes && (
              <div className="text-sm bg-black/30 p-3 rounded-xl">
                <b>📝 ملاحظات:</b> {detailOrder.notes}
              </div>
            )}

            {/* الأزرار السفلية: إلغاء الطلب وإغلاق */}
            <div className="flex items-center gap-2 pt-2 border-t border-line">
              {detailOrder.status !== "CANCELLED" && (
                <button 
                  type="button" 
                  className="btn btn-ghost text-bad hover:bg-bad/15 flex-1"
                  onClick={async () => {
                    if (!confirm("هل أنت متأكد من إلغاء هذا الطلب نهائياً؟")) return;
                    try {
                      await api(`/api/admin/${slug}/orders`, {
                        method: "PATCH",
                        body: { id: detailOrder.id, action: "cancel" }
                      });
                      setDetailOrder(null);
                      toast("تم إلغاء الطلب بنجاح", "good");
                      void load();
                    } catch (e: any) {
                      toast(err(e.code), "err");
                    }
                  }}
                >
                  ❌ إلغاء الطلب
                </button>
              )}
              <button className="btn btn-ghost flex-1" onClick={() => setDetailOrder(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

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