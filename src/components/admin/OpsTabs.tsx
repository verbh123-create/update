"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/time";
import { PERMISSIONS, type DayHours, type Slot } from "@/lib/types";
import { Field, ImageUploader, Modal, Toggle, toast } from "@/components/ui";
import { adminErr, Loading, Money, Panel, useRows } from "./shared";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ───────────── hours & status ───────────── */
type HoursState = { status: string; hours: DayHours[]; closedDates: string[]; deliverySlots: Slot[]; minOrder: number; loyaltyThreshold: number };

export function HoursTab({ slug }: { slug: string }) {
  const base = `/api/admin/${slug}/hours`;
  const [s, setS] = useState<HoursState | null>(null);
  const [newDate, setNewDate] = useState("");
  useEffect(() => {
    api<HoursState>(base).then(setS).catch((e) => toast(adminErr(e), "err"));
  }, [base]);
  if (!s) return <Loading rows={null} />;

  const save = async (patch: Partial<HoursState>, msg = "Saved") => {
    try {
      await api(base, { method: "PUT", body: patch });
      toast(msg);
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };
  const setDay = (d: number, patch: Partial<DayHours>) => setS({ ...s, hours: s.hours.map((h, i) => (i === d ? { ...h, ...patch } : h)) });

  return (
    <div>
      <Panel title="Truck status (live)">
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: "open", label: "Open · مفتوح", cls: "btn-primary" },
            { id: "busy", label: "Busy · مشغول", cls: "btn-soft" },
            { id: "closed", label: "Closed · مغلق", cls: "btn-danger" },
          ].map((x) => (
            <button
              key={x.id}
              className={`btn py-4 text-base ${s.status === x.id ? x.cls : "btn-ghost"}`}
              style={s.status === x.id ? { outline: "2px solid var(--accent)", outlineOffset: 2 } : undefined}
              onClick={() => {
                setS({ ...s, status: x.id });
                void save({ status: x.id }, `Status: ${x.id}`);
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Closed blocks all new orders. Busy still accepts orders but shows a delay notice. Operating hours below are always enforced.</p>
      </Panel>

      <Panel title="Operating hours (Bahrain time)" actions={<button className="btn btn-primary btn-sm" onClick={() => save({ hours: s.hours })}>Save hours</button>}>
        <div className="space-y-2">
          {s.hours.map((h, d) => (
            <div key={d} className="card-2 flex flex-wrap items-center gap-3 p-3">
              <b className="w-28">{DAYS[d]}</b>
              <Toggle checked={!h.closed} onChange={(v) => setDay(d, { closed: !v })} label={h.closed ? "Closed all day" : "Open"} />
              {!h.closed && (
                <div className="flex flex-wrap items-center gap-2">
                  {h.shifts.map((sh, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-xl border border-line px-2 py-1">
                      <input type="time" className="input !min-h-8 !w-28 !py-0.5" value={sh.from} onChange={(e) => setDay(d, { shifts: h.shifts.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                      –
                      <input type="time" className="input !min-h-8 !w-28 !py-0.5" value={sh.to} onChange={(e) => setDay(d, { shifts: h.shifts.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                      <button className="text-bad" onClick={() => setDay(d, { shifts: h.shifts.filter((_, j) => j !== i) })}>✕</button>
                    </span>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setDay(d, { shifts: [...h.shifts, { from: "16:00", to: "23:00" }] })}>
                    + shift
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Use split shifts by adding several shifts per day. A shift ending earlier than it starts (e.g. 18:00 → 02:00) runs past midnight. Closed days also block subscription scheduling.</p>
      </Panel>

      <Panel title="Day-specific closures" actions={<button className="btn btn-primary btn-sm" onClick={() => save({ closedDates: s.closedDates })}>Save closures</button>}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input !w-auto" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button
            className="btn btn-soft btn-sm"
            disabled={!newDate}
            onClick={() => {
              setS({ ...s, closedDates: [...new Set([...s.closedDates, newDate])].sort() });
              setNewDate("");
            }}
          >
            + Add closed date
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.closedDates.map((d) => (
            <span key={d} className="chip chip-bad">
              {d} <button onClick={() => setS({ ...s, closedDates: s.closedDates.filter((x) => x !== d) })}>✕</button>
            </span>
          ))}
          {s.closedDates.length === 0 && <span className="text-sm text-muted">No special closures.</span>}
        </div>
      </Panel>

      <Panel
        title="Delivery time slots (independent of operating hours)"
        actions={
          <>
            <button className="btn btn-soft btn-sm" onClick={() => setS({ ...s, deliverySlots: [...s.deliverySlots, { id: `s${Date.now().toString(36)}`, from: "12:00", to: "14:00" }] })}>
              + Slot
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => save({ deliverySlots: s.deliverySlots })}>Save slots</button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {s.deliverySlots.map((sl, i) => (
            <span key={sl.id} className="flex items-center gap-1 rounded-xl border border-line px-2 py-1">
              <input type="time" className="input !min-h-8 !w-28 !py-0.5" value={sl.from} onChange={(e) => setS({ ...s, deliverySlots: s.deliverySlots.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
              –
              <input type="time" className="input !min-h-8 !w-28 !py-0.5" value={sl.to} onChange={(e) => setS({ ...s, deliverySlots: s.deliverySlots.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
              <button className="text-bad" onClick={() => setS({ ...s, deliverySlots: s.deliverySlots.filter((_, j) => j !== i) })}>✕</button>
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Ordering rules" actions={<button className="btn btn-primary btn-sm" onClick={() => save({ minOrder: s.minOrder, loyaltyThreshold: s.loyaltyThreshold })}>Save</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Minimum order (BHD)">
            <input type="number" step="0.1" min="0" className="input" value={s.minOrder} onChange={(e) => setS({ ...s, minOrder: Number(e.target.value) })} />
          </Field>
          <Field label="Loyalty: buy N, next one free" hint="Master on/off switch is in Super Admin → Settings.">
            <input type="number" min="1" className="input" value={s.loyaltyThreshold} onChange={(e) => setS({ ...s, loyaltyThreshold: Number(e.target.value) })} />
          </Field>
        </div>
      </Panel>
    </div>
  );
}

/* ───────────── regions ───────────── */
type Region = { id?: number; nameEn: string; nameAr: string; fee: number; active: boolean };
export function RegionsTab({ slug }: { slug: string }) {
  const regions = useRows<Region & { id: number }>(`/api/admin/${slug}/regions`);
  const [edit, setEdit] = useState<Region | null>(null);
  return (
    <Panel title="Delivery regions & fees" actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ nameEn: "", nameAr: "", fee: 1, active: true })}>+ Region</button>}>
      <Loading rows={regions.rows} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th>الاسم</th>
              <th>Delivery fee</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(regions.rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="font-bold">{r.nameEn}</td>
                <td>{r.nameAr}</td>
                <td className="font-bold text-accent">{Money(r.fee)}</td>
                <td>
                  <Toggle checked={r.active} onChange={(v) => regions.save({ id: r.id, active: v })} />
                </td>
                <td className="whitespace-nowrap text-end">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>Edit</button>{" "}
                  <button className="btn btn-danger btn-sm" onClick={() => regions.remove(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit region" : "New region"}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name (English)">
                <input className="input" value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} />
              </Field>
              <Field label="Name (Arabic)">
                <input className="input" dir="rtl" value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} />
              </Field>
            </div>
            <Field label="Delivery fee (BHD)">
              <input type="number" step="0.001" min="0" className="input" value={edit.fee} onChange={(e) => setEdit({ ...edit, fee: Number(e.target.value) })} />
            </Field>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
            <button className="btn btn-primary w-full" disabled={!edit.nameEn.trim()} onClick={async () => (await regions.save(edit as unknown as Record<string, unknown>)) && setEdit(null)}>
              Save region
            </button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ───────────── promotions ───────────── */
type Coupon = { id?: number; code: string; type: string; value: number; minOrder: number; startsOn: string | null; endsOn: string | null; maxUses: number | null; usedCount?: number; active: boolean };
type Banner = { id?: number; kind: string; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string; imageUrl: string; startsOn: string | null; endsOn: string | null; active: boolean };

export function PromosTab({ slug }: { slug: string }) {
  const coupons = useRows<Coupon & { id: number }>(`/api/admin/${slug}/coupons`);
  const banners = useRows<Banner & { id: number }>(`/api/admin/${slug}/banners`);
  const [c, setC] = useState<Coupon | null>(null);
  const [b, setB] = useState<Banner | null>(null);
  return (
    <div>
      <Panel title="Coupons" actions={<button className="btn btn-primary btn-sm" onClick={() => setC({ code: "", type: "percent", value: 10, minOrder: 0, startsOn: null, endsOn: null, maxUses: null, active: true })}>+ Coupon</button>}>
        <Loading rows={coupons.rows} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Active dates</th>
                <th>Used</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(coupons.rows ?? []).map((x) => (
                <tr key={x.id}>
                  <td className="font-mono font-bold">{x.code}</td>
                  <td>{x.type === "percent" ? `${x.value}%` : Money(x.value)}</td>
                  <td>{Money(x.minOrder)}</td>
                  <td>{x.startsOn || "—"} → {x.endsOn || "—"}</td>
                  <td>{x.usedCount}{x.maxUses ? ` / ${x.maxUses}` : ""}</td>
                  <td><Toggle checked={x.active} onChange={(v) => coupons.save({ id: x.id, active: v })} /></td>
                  <td className="whitespace-nowrap text-end">
                    <button className="btn btn-ghost btn-sm" onClick={() => setC(x)}>Edit</button>{" "}
                    <button className="btn btn-danger btn-sm" onClick={() => coupons.remove(x.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Banners & pop-up announcements" actions={<button className="btn btn-primary btn-sm" onClick={() => setB({ kind: "popup", titleEn: "", titleAr: "", bodyEn: "", bodyAr: "", imageUrl: "", startsOn: null, endsOn: null, active: true })}>+ Banner</button>}>
        <Loading rows={banners.rows} />
        <div className="grid gap-3 sm:grid-cols-2">
          {(banners.rows ?? []).map((x) => (
            <div key={x.id} className="card-2 flex items-center gap-3 p-3">
              {x.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.imageUrl} alt="" className="h-14 w-20 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{x.titleEn || x.titleAr || "(untitled)"}</div>
                <div className="text-xs text-muted">{x.kind} · {x.startsOn || "—"} → {x.endsOn || "—"}</div>
              </div>
              <Toggle checked={x.active} onChange={(v) => banners.save({ id: x.id, active: v })} />
              <button className="btn btn-ghost btn-sm" onClick={() => setB(x)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => banners.remove(x.id)}>✕</button>
            </div>
          ))}
        </div>
      </Panel>

      {c && (
        <Modal open onClose={() => setC(null)} title={c.id ? "Edit coupon" : "New coupon"}>
          <div className="space-y-3">
            <Field label="Code"><input className="input uppercase" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className="input" value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}>
                  <option value="percent">Percent %</option>
                  <option value="fixed">Fixed amount (BHD)</option>
                </select>
              </Field>
              <Field label="Value"><input type="number" step="0.001" min="0" className="input" value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) })} /></Field>
              <Field label="Starts on"><input type="date" className="input" value={c.startsOn ?? ""} onChange={(e) => setC({ ...c, startsOn: e.target.value || null })} /></Field>
              <Field label="Ends on"><input type="date" className="input" value={c.endsOn ?? ""} onChange={(e) => setC({ ...c, endsOn: e.target.value || null })} /></Field>
              <Field label="Min order (BHD)"><input type="number" step="0.1" min="0" className="input" value={c.minOrder} onChange={(e) => setC({ ...c, minOrder: Number(e.target.value) })} /></Field>
              <Field label="Max uses (empty = ∞)"><input type="number" min="0" className="input" value={c.maxUses ?? ""} onChange={(e) => setC({ ...c, maxUses: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            </div>
            <Toggle checked={c.active} onChange={(v) => setC({ ...c, active: v })} label="Active" />
            <button className="btn btn-primary w-full" disabled={!c.code.trim()} onClick={async () => (await coupons.save(c as unknown as Record<string, unknown>)) && setC(null)}>Save coupon</button>
          </div>
        </Modal>
      )}
      {b && (
        <Modal open onClose={() => setB(null)} title={b.id ? "Edit banner" : "New banner"} wide>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title (English)"><input className="input" value={b.titleEn} onChange={(e) => setB({ ...b, titleEn: e.target.value })} /></Field>
              <Field label="Title (Arabic)"><input className="input" dir="rtl" value={b.titleAr} onChange={(e) => setB({ ...b, titleAr: e.target.value })} /></Field>
              <Field label="Text (English)"><textarea className="input" rows={2} value={b.bodyEn} onChange={(e) => setB({ ...b, bodyEn: e.target.value })} /></Field>
              <Field label="Text (Arabic)"><textarea className="input" dir="rtl" rows={2} value={b.bodyAr} onChange={(e) => setB({ ...b, bodyAr: e.target.value })} /></Field>
              <Field label="Kind">
                <select className="input" value={b.kind} onChange={(e) => setB({ ...b, kind: e.target.value })}>
                  <option value="popup">Pop-up announcement</option>
                  <option value="banner">Inline banner</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><input type="date" className="input" value={b.startsOn ?? ""} onChange={(e) => setB({ ...b, startsOn: e.target.value || null })} /></Field>
                <Field label="To"><input type="date" className="input" value={b.endsOn ?? ""} onChange={(e) => setB({ ...b, endsOn: e.target.value || null })} /></Field>
              </div>
            </div>
            <ImageUploader label="Promotional graphic" value={b.imageUrl} onChange={(u) => setB({ ...b, imageUrl: u })} />
            <Toggle checked={b.active} onChange={(v) => setB({ ...b, active: v })} label="Active" />
            <button className="btn btn-primary w-full" onClick={async () => (await banners.save(b as unknown as Record<string, unknown>)) && setB(null)}>Save banner</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────── payments ───────────── */
type Pay = {
  payCash: boolean; payBenefit: boolean; payCard: boolean; benefitQrUrl: string; benefitIban: string; benefitName: string;
  gatewayProvider: string; gatewayMode: string; gatewayPublicKey: string; gatewaySecretKey: string; gatewayWebhookSecret: string; webhookUrl: string;
};
export function PaymentsTab({ slug }: { slug: string }) {
  const base = `/api/admin/${slug}/payments`;
  const [p, setP] = useState<Pay | null>(null);
  useEffect(() => {
    api<Pay>(base).then(setP).catch((e) => toast(adminErr(e), "err"));
  }, [base]);
  if (!p) return <Loading rows={null} />;
  const save = async () => {
    try {
      await api(base, { method: "PUT", body: p });
      toast("Payment settings saved");
      setP(await api<Pay>(base));
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };
  return (
    <div>
      <Panel title="Payment methods" actions={<button className="btn btn-primary btn-sm" onClick={save}>Save all</button>}>
        <div className="space-y-4">
          <div className="card-2 p-4">
            <Toggle checked={p.payCash} onChange={(v) => setP({ ...p, payCash: v })} label="💵 Cash on Delivery / Pickup (الدفع النقدي)" />
          </div>
          <div className="card-2 space-y-3 p-4">
            <Toggle checked={p.payBenefit} onChange={(v) => setP({ ...p, payBenefit: v })} label="📲 BenefitPay (بنفت بي) — manual verification by staff" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="IBAN"><input className="input font-mono" value={p.benefitIban} onChange={(e) => setP({ ...p, benefitIban: e.target.value })} /></Field>
              <Field label="Account name"><input className="input" value={p.benefitName} onChange={(e) => setP({ ...p, benefitName: e.target.value })} /></Field>
            </div>
            <ImageUploader label="BenefitPay QR code" contain value={p.benefitQrUrl} onChange={(u) => setP({ ...p, benefitQrUrl: u })} />
          </div>
          <div className="card-2 space-y-3 p-4">
            <Toggle checked={p.payCard} onChange={(v) => setP({ ...p, payCard: v })} label="💳 Cards, Apple Pay & Google Pay (بطاقات، أبل وجوجل باي)" />
            <p className="text-xs text-muted">Only shown to customers once a secret key is saved. The webhook confirms payment — orders reach the kitchen only after payment is confirmed.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gateway provider">
                <select className="input" value={p.gatewayProvider} onChange={(e) => setP({ ...p, gatewayProvider: e.target.value })}>
                  <option value="tap">Tap Payments</option>
                  <option value="myfatoorah">MyFatoorah</option>
                </select>
              </Field>
              <Field label="Mode">
                <select className="input" value={p.gatewayMode} onChange={(e) => setP({ ...p, gatewayMode: e.target.value })}>
                  <option value="test">Test / sandbox</option>
                  <option value="live">Live</option>
                </select>
              </Field>
              <Field label="Public key"><input className="input font-mono" value={p.gatewayPublicKey} onChange={(e) => setP({ ...p, gatewayPublicKey: e.target.value })} /></Field>
              <Field label="Secret key / API token"><input className="input font-mono" type="password" value={p.gatewaySecretKey} onChange={(e) => setP({ ...p, gatewaySecretKey: e.target.value })} autoComplete="off" /></Field>
              <Field label="Webhook secret (optional)" hint="Appended as ?secret=… to the webhook URL below."><input className="input font-mono" type="password" value={p.gatewayWebhookSecret} onChange={(e) => setP({ ...p, gatewayWebhookSecret: e.target.value })} autoComplete="off" /></Field>
              <Field label="Webhook URL (paste into gateway dashboard)"><input readOnly className="input font-mono text-xs" value={p.webhookUrl} onFocus={(e) => e.target.select()} /></Field>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ───────────── customers ───────────── */
type Cust = { id: number; name: string; phone: string; email: string; regionName: string; address: string; createdAt: string; stamps: number; orders: number; spent: number };
export function CustomersTab({ slug }: { slug: string }) {
  const base = `/api/admin/${slug}/customers`;
  const { rows } = useRows<Cust>(base);
  const [q, setQ] = useState("");
  const [reset, setReset] = useState<Cust | null>(null);
  const [pw, setPw] = useState("");
  const list = (rows ?? []).filter((c) => !q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title={`Customers (${rows?.length ?? 0})`} actions={<input className="input !min-h-9 !w-56 !py-1" placeholder="Search name / phone / email" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <Loading rows={rows} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Address</th>
              <th>Orders</th>
              <th>Spent</th>
              <th>Stamps</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="font-bold">{c.name}</td>
                <td className="text-xs">{c.phone}<br />{c.email}</td>
                <td className="text-xs">{c.regionName}<br />{c.address}</td>
                <td>{c.orders}</td>
                <td>{Money(c.spent)}</td>
                <td>{c.stamps}</td>
                <td className="text-xs">{fmtDateTime(c.createdAt, "en")}</td>
                <td className="text-end"><button className="btn btn-ghost btn-sm" onClick={() => { setReset(c); setPw(""); }}>Reset password</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reset && (
        <Modal open onClose={() => setReset(null)} title={`Reset password · ${reset.name}`}>
          <div className="space-y-3">
            <Field label="New password (min 6 characters)"><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <button
              className="btn btn-primary w-full"
              disabled={pw.length < 6}
              onClick={async () => {
                try {
                  await api(base, { body: { id: reset.id, password: pw } });
                  toast("Password updated");
                  setReset(null);
                } catch (e) {
                  toast(adminErr(e), "err");
                }
              }}
            >
              Update password
            </button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ───────────── employees & RBAC ───────────── */
type Emp = { id?: number; username: string; name: string; role?: string; truckId?: number | null; permissions: string[]; protected?: boolean; active: boolean; password?: string };
const PERM_LABEL: Record<string, string> = {
  orders: "Live orders", drivers: "Drivers & payouts", reports: "Financial reports", menu: "Menu & stock", hours: "Hours & status", regions: "Delivery regions",
  promos: "Promotions", payments: "Payments", customers: "Customers CRM", employees: "Employees", content: "Texts & images", pos: "POS terminal", kitchen: "Kitchen display",
};

export function EmployeesTab({ base, meId, trucks }: { base: string; meId: number; trucks?: { id: number; name: string }[] }) {
  const { rows, save, remove } = useRows<Emp & { id: number }>(base);
  const [e, setE] = useState<Emp | null>(null);
  const toggle = (p: string) => e && setE({ ...e, permissions: e.permissions.includes(p) ? e.permissions.filter((x) => x !== p) : [...e.permissions, p] });
  return (
    <Panel title="Employees & permissions" actions={<button className="btn btn-primary btn-sm" onClick={() => setE({ username: "", name: "", password: "", permissions: ["pos"], active: true, truckId: trucks?.[0]?.id ?? null })}>+ Employee</button>}>
      <Loading rows={rows} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Scope</th>
              <th>Permissions</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((x) => (
              <tr key={x.id}>
                <td>
                  <b>{x.username}</b>
                  <div className="text-xs text-muted">{x.name}</div>
                </td>
                <td>{x.role === "super" ? <span className="chip chip-accent">Super admin 🔒</span> : trucks ? trucks.find((t) => t.id === x.truckId)?.name ?? "All trucks" : "This truck"}</td>
                <td className="max-w-xs text-xs">{x.role === "super" ? "Full access (protected)" : x.permissions.map((p) => PERM_LABEL[p] ?? p).join(", ") || "—"}</td>
                <td>{x.protected ? "—" : <Toggle checked={x.active} onChange={(v) => save({ id: x.id, active: v })} />}</td>
                <td className="whitespace-nowrap text-end">
                  {(!x.protected || x.id === meId) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setE({ ...x, password: "" })}>
                      {x.protected ? "Change password" : "Edit"}
                    </button>
                  )}{" "}
                  {!x.protected && x.id !== meId && <button className="btn btn-danger btn-sm" onClick={() => remove(x.id)}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {e && (
        <Modal open onClose={() => setE(null)} title={e.id ? `Edit ${e.username}` : "New employee"} wide>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Username"><input className="input" disabled={!!e.id} value={e.username} onChange={(ev) => setE({ ...e, username: ev.target.value })} autoCapitalize="none" /></Field>
              <Field label="Display name"><input className="input" value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} /></Field>
              <Field label={e.id ? "New password (optional)" : "Password"}><input className="input" type="text" value={e.password ?? ""} onChange={(ev) => setE({ ...e, password: ev.target.value })} autoComplete="off" /></Field>
            </div>
            {trucks && !e.protected && (
              <Field label="Truck">
                <select className="input" value={e.truckId ?? ""} onChange={(ev) => setE({ ...e, truckId: ev.target.value ? Number(ev.target.value) : null })}>
                  <option value="">All trucks</option>
                  {trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            {!e.protected && (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Permissions</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PERMISSIONS.map((p) => (
                    <label key={p} className="card-2 flex items-center gap-2 p-2 text-sm font-semibold">
                      <input type="checkbox" checked={e.permissions.includes(p)} onChange={() => toggle(p)} /> {PERM_LABEL[p]}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button
              className="btn btn-primary w-full"
              disabled={!e.username.trim() || (!e.id && (e.password ?? "").length < 6)}
              onClick={async () => {
                const payload: Record<string, unknown> = { ...e };
                if (!payload.password) delete payload.password;
                if (await save(payload)) setE(null);
              }}
            >
              Save employee
            </button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
