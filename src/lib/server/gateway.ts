import { trucks } from "@/db/schema";
import { ApiError } from "./http";

type TruckRow = typeof trucks.$inferSelect;

export const gatewayReady = (t: TruckRow) => !!t.gatewaySecretKey;

function myfatoorahBase(t: TruckRow) {
  return t.gatewayMode === "live" ? "https://api.myfatoorah.com" : "https://apitest.myfatoorah.com";
}

export type ChargeInput = {
  orderNo: string;
  amount: number;
  name: string;
  phone: string;
  email: string;
  webhookUrl: string;
  returnUrl: string;
};

/** Creates a hosted checkout session and returns the URL the customer is redirected to. */
export async function createCharge(t: TruckRow, c: ChargeInput): Promise<{ url: string; ref: string }> {
  if (!gatewayReady(t)) throw new ApiError("payment_disabled");
  try {
    if (t.gatewayProvider === "myfatoorah") {
      const res = await fetch(`${myfatoorahBase(t)}/v2/SendPayment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.gatewaySecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          CustomerName: c.name || "Customer",
          NotificationOption: "LNK",
          InvoiceValue: c.amount,
          DisplayCurrencyIso: "BHD",
          CustomerEmail: c.email || undefined,
          CustomerMobile: c.phone.replace(/\D/g, "").slice(-8) || undefined,
          CallBackUrl: c.returnUrl,
          ErrorUrl: c.returnUrl,
          CustomerReference: c.orderNo,
          Language: "en",
        }),
      });
      const j = await res.json();
      const url = j?.Data?.InvoiceURL;
      if (!res.ok || !url) throw new Error(JSON.stringify(j).slice(0, 300));
      return { url, ref: String(j.Data.InvoiceId) };
    }
    // Default: Tap Payments (supports Benefit, cards, Apple Pay and Google Pay in Bahrain)
    const digits = c.phone.replace(/\D/g, "");
    const res = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: { Authorization: `Bearer ${t.gatewaySecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: c.amount,
        currency: "BHD",
        customer_initiated: true,
        save_card: false,
        description: `Order ${c.orderNo}`,
        reference: { transaction: c.orderNo, order: c.orderNo },
        receipt: { email: false, sms: false },
        customer: {
          first_name: c.name || "Customer",
          email: c.email || undefined,
          phone: digits ? { country_code: "973", number: digits.slice(-8) } : undefined,
        },
        source: { id: "src_all" },
        post: { url: c.webhookUrl },
        redirect: { url: c.returnUrl },
      }),
    });
    const j = await res.json();
    const url = j?.transaction?.url;
    if (!res.ok || !url) throw new Error(JSON.stringify(j).slice(0, 300));
    return { url, ref: String(j.id) };
  } catch (e) {
    console.error("[gateway] createCharge failed", e);
    throw new ApiError("generic", 502);
  }
}

/** Asks the gateway directly whether a charge/invoice is paid (webhook payloads are never trusted blindly). */
export async function fetchPaid(t: TruckRow, ref: string): Promise<boolean> {
  try {
    if (t.gatewayProvider === "myfatoorah") {
      const res = await fetch(`${myfatoorahBase(t)}/v2/GetPaymentStatus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t.gatewaySecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ Key: ref, KeyType: "InvoiceId" }),
      });
      const j = await res.json();
      return j?.Data?.InvoiceStatus === "Paid";
    }
    const res = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${t.gatewaySecretKey}` },
    });
    const j = await res.json();
    return j?.status === "CAPTURED";
  } catch (e) {
    console.error("[gateway] fetchPaid failed", e);
    return false;
  }
}

export function extractRef(t: TruckRow, body: Record<string, unknown>): string {
  if (t.gatewayProvider === "myfatoorah") {
    const d = (body.Data ?? {}) as Record<string, unknown>;
    const inv = (d.Invoice ?? {}) as Record<string, unknown>;
    return String(d.InvoiceId ?? inv.Id ?? "");
  }
  return String(body.id ?? "");
}
