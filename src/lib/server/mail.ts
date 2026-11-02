// Resend e-mail delivery. Set RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) in the environment.
export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Street Taste Truck <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("[mail] resend failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[mail] error", e);
    return false;
  }
}

export function otpEmail(code: string, purpose: "signup" | "reset") {
  const title = purpose === "signup" ? "Verify your email · تحقق من بريدك" : "Reset your password · إعادة تعيين كلمة المرور";
  return {
    subject: `${code} — Street Taste Truck`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#121212;color:#fff;border-radius:16px">
      <h2 style="color:#FFE600;margin:0 0 12px">Street Taste Truck</h2>
      <p style="margin:0 0 16px">${title}</p>
      <div style="font-size:36px;letter-spacing:10px;font-weight:800;background:#2A2A2A;padding:16px;text-align:center;border-radius:12px;color:#FFE600">${code}</div>
      <p style="color:#aaa;font-size:13px;margin-top:16px">This code expires in 10 minutes. · ينتهي الرمز خلال 10 دقائق.</p></div>`,
  };
}
