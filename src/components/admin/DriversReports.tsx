"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, bhParts, fmtDateTime } from "@/lib/time";
import type { OrderView } from "@/lib/types";
import { Field, Modal, Toggle, toast } from "@/components/ui";
import { adminErr, DateRange, Loading, Money, Panel, Stat, useRows } from "./shared";

type Driver = { id?: number; name: string; phone: string; defaultCommission: number; active: boolean };

export function DriversTab({ slug }: { slug: string }) {
  const drivers = useRows<Driver & { id: number }>(`/api/admin/${slug}/drivers`);
  const [edit, setEdit] = useState<Driver | null>(null);
  const today = bhParts().date;
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<{ drivers: { driverId: number; name: string; deliveries: number; commission: number; paid: number; unpaid: number }[]; orders: OrderView[] } | null>(null);
  const [payouts, setPayouts] = useState<{ id: number; driverName: string; fromDate: string; toDate: string; amount: number; deliveries: number; paidAt: string; paidBy: string }[]>([]);

  const loadReport = useCallback(async () => {
    try {
      setReport(await api(`/api/admin/${slug}/driver-report?from=${from}&to=${to}`));
      const p = await api<{ rows: typeof payouts }>(`/api/admin/${slug}/payouts`);
      setPayouts(p.rows);
    } catch (e) {
      toast(adminErr(e), "err");
    }
  }, [slug, from, to]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const pay = async (d: { driverId: number; name: string; unpaid: number }) => {
    if (!confirm(`Mark ${Money(d.unpaid)} as paid to ${d.name} for ${from} → ${to}?`)) return;
    try {
      await api(`/api/admin/${slug}/payouts`, { body: { driverId: d.driverId, from, to } });
      toast(`Paid to ${d.name}`);
      void loadReport();
    } catch (e) {
      toast(adminErr(e), "err");
    }
  };

  return (
    <div>
      <Panel
        title="Drivers"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEdit({ name: "", phone: "", defaultCommission: 0.5, active: true })}>
            + Driver
          </button>
        }
      >
        <Loading rows={drivers.rows} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Default commission / order</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(drivers.rows ?? []).map((d) => (
                <tr key={d.id}>
                  <td className="font-bold">{d.name}</td>
                  <td>{d.phone}</td>
                  <td>{Money(d.defaultCommission)}</td>
                  <td>
                    <Toggle checked={d.active} onChange={(v) => drivers.save({ id: d.id, active: v })} />
                  </td>
                  <td className="whitespace-nowrap text-end">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit(d)}>
                      Edit
                    </button>{" "}
                    <button className="btn btn-danger btn-sm" onClick={() => drivers.remove(d.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Driver report & weekly payout" actions={<DateRange from={from} to={to} today={today} addDays={addDays} onChange={(f, t) => (setFrom(f), setTo(t))} />}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Completed deliveries</th>
                <th>Commission earned</th>
                <th>Already paid</th>
                <th>Unpaid</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(report?.drivers ?? []).map((d) => (
                <tr key={d.driverId}>
                  <td className="font-bold">{d.name}</td>
                  <td>{d.deliveries}</td>
                  <td>{Money(d.commission)}</td>
                  <td className="text-good">{Money(d.paid)}</td>
                  <td className="font-bold text-accent">{Money(d.unpaid)}</td>
                  <td className="text-end">
                    <button className="btn btn-primary btn-sm" disabled={d.unpaid <= 0} onClick={() => pay(d)}>
                      Paid to Driver · تم الدفع للسواق
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Only deliveries marked “Delivered” in Live Orders with an assigned driver are counted. Paying locks the covered orders.</p>

        {report && report.orders.length > 0 && (
          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Driver</th>
                  <th>Region</th>
                  <th>Commission</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNo}</td>
                    <td>{fmtDateTime(o.scheduledFor ?? o.createdAt, "en")}</td>
                    <td>{o.driverName}</td>
                    <td>{o.regionName}</td>
                    <td>{Money(o.driverCommission)}</td>
                    <td>{o.driverPaid ? <span className="chip chip-good">paid</span> : <span className="chip">unpaid</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Payout history">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Paid at</th>
                <th>Driver</th>
                <th>Period</th>
                <th>Deliveries</th>
                <th>Amount</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.paidAt, "en")}</td>
                  <td>{p.driverName}</td>
                  <td>
                    {p.fromDate} → {p.toDate}
                  </td>
                  <td>{p.deliveries}</td>
                  <td className="font-bold">{Money(p.amount)}</td>
                  <td>{p.paidBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit driver" : "New driver"}>
          <div className="space-y-3">
            <Field label="Name">
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Default commission per delivery (BHD)">
              <input type="number" step="0.001" min="0" className="input" value={edit.defaultCommission} onChange={(e) => setEdit({ ...edit, defaultCommission: Number(e.target.value) })} />
            </Field>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
            <button
              className="btn btn-primary w-full"
              disabled={!edit.name.trim()}
              onClick={async () => {
                if (await drivers.save(edit as unknown as Record<string, unknown>)) setEdit(null);
              }}
            >
              Save driver
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Report = {
  from: string;
  to: string;
  summary: { orders: number; cancelled: number; subtotal: number; discounts: number; deliveryFees: number; revenue: number; avg: number; byPayment: Record<string, number>; byKind: Record<string, number> };
  daily: { date: string; orders: number; revenue: number }[];
  orders: OrderView[];
};

export function ReportsTab({ slug }: { slug: string }) {
  const today = bhParts().date;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [r, setR] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try {
      setR(await api<Report>(`/api/admin/${slug}/reports?from=${from}&to=${to}`));
    } catch (e) {
      toast(adminErr(e), "err");
    }
  }, [slug, from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = (r?.orders ?? []).map((o) => ({
    Order: o.orderNo,
    Date: fmtDateTime(o.scheduledFor ?? o.createdAt, "en"),
    Type: o.kind,
    Fulfillment: o.fulfillment,
    Payment: o.paymentMethod,
    "Payment status": o.paymentStatus,
    Subtotal: o.subtotal,
    Discounts: Number((o.couponDiscount + o.loyaltyDiscount + o.subscriptionDiscount).toFixed(3)),
    "Delivery fee": o.deliveryFee,
    Total: o.total,
    Customer: o.customerName ?? "",
  }));

  const exportXlsx = async () => {
    if (!r) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const s = r.summary;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Metric: "Period", Value: `${r.from} → ${r.to}` },
        { Metric: "Orders", Value: s.orders },
        { Metric: "Cancelled orders", Value: s.cancelled },
        { Metric: "Subtotal (BHD)", Value: s.subtotal },
        { Metric: "Discounts (BHD)", Value: s.discounts },
        { Metric: "Delivery fees (BHD)", Value: s.deliveryFees },
        { Metric: "Revenue (BHD)", Value: s.revenue },
        { Metric: "Average order (BHD)", Value: Number(s.avg.toFixed(3)) },
        ...Object.entries(s.byPayment).map(([k, v]) => ({ Metric: `Revenue · ${k}`, Value: v })),
      ]),
      "Summary",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.daily.map((d) => ({ Date: d.date, Orders: d.orders, "Revenue (BHD)": Number(d.revenue.toFixed(3)) }))), "Daily");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Orders");
    XLSX.writeFile(wb, `sales-${slug}-${r.from}_${r.to}.xlsx`);
  };

  const exportPdf = async () => {
    if (!r) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Street Taste Truck - ${slug} sales report`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Period: ${r.from} to ${r.to}`, 14, 23);
    autoTable(doc, {
      startY: 28,
      head: [["Orders", "Cancelled", "Subtotal", "Discounts", "Delivery fees", "Revenue", "Average"]],
      body: [[r.summary.orders, r.summary.cancelled, r.summary.subtotal.toFixed(3), r.summary.discounts.toFixed(3), r.summary.deliveryFees.toFixed(3), r.summary.revenue.toFixed(3) + " BHD", r.summary.avg.toFixed(3)]],
      headStyles: { fillColor: [30, 30, 30] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y1 = ((doc as any).lastAutoTable?.finalY ?? 40) + 8;
    autoTable(doc, {
      startY: y1,
      head: [["Date", "Orders", "Revenue (BHD)"]],
      body: r.daily.map((d) => [d.date, d.orders, d.revenue.toFixed(3)]),
      headStyles: { fillColor: [30, 30, 30] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y2 = ((doc as any).lastAutoTable?.finalY ?? 60) + 8;
    autoTable(doc, {
      startY: y2,
      head: [["Order", "Date", "Type", "Fulfillment", "Payment", "Subtotal", "Discounts", "Delivery", "Total"]],
      body: rows.map((x) => [x.Order, x.Date, x.Type, x.Fulfillment, x.Payment, x.Subtotal.toFixed(3), x.Discounts.toFixed(3), x["Delivery fee"].toFixed(3), x.Total.toFixed(3)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });
    doc.save(`sales-${slug}-${r.from}_${r.to}.pdf`);
  };

  return (
    <div>
      <Panel
        title="Financial reports"
        actions={
          <>
            <button className="btn btn-soft btn-sm" disabled={!r} onClick={exportXlsx}>
              ⬇ Excel (.xlsx)
            </button>
            <button className="btn btn-soft btn-sm" disabled={!r} onClick={exportPdf}>
              ⬇ PDF
            </button>
          </>
        }
      >
        <DateRange from={from} to={to} today={today} addDays={addDays} onChange={(f, t) => (setFrom(f), setTo(t))} />
        {!r && <p className="mt-4 text-muted">Loading…</p>}
        {r && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Revenue" value={Money(r.summary.revenue)} sub={`${r.summary.orders} orders`} />
              <Stat label="Average order" value={Money(r.summary.avg)} />
              <Stat label="Discounts given" value={Money(r.summary.discounts)} />
              <Stat label="Delivery fees" value={Money(r.summary.deliveryFees)} sub={`${r.summary.cancelled} cancelled`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {Object.entries(r.summary.byPayment).map(([k, v]) => (
                <span key={k} className="chip">
                  {k}: {Money(v)}
                </span>
              ))}
              {Object.entries(r.summary.byKind).map(([k, v]) => (
                <span key={k} className="chip chip-accent">
                  {k}: {Money(v)}
                </span>
              ))}
            </div>
          </>
        )}
      </Panel>

      {r && (
        <>
          <Panel title="Daily breakdown">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Orders</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {r.daily.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.orders}</td>
                      <td className="font-bold">{Money(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title={`Orders (${rows.length})`}>
            <div className="table-wrap max-h-[28rem] overflow-y-auto">
              <table>
                <thead>
                  <tr>
                    {rows[0] && Object.keys(rows[0]).map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.Order}>
                      {Object.values(x).map((v, i) => (
                        <td key={i}>{typeof v === "number" ? v.toFixed(3) : v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
