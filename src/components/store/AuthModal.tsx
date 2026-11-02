"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Modal, toast } from "@/components/ui";
import { useErr, useLocalized, useT } from "@/components/I18n";
import type { Customer, StoreRegion } from "./shared";

type Mode = "login" | "register" | "otp" | "forgot" | "reset";

export default function AuthModal({
  open,
  onClose,
  regions,
  onAuthed,
  initialMode = "login",
}: {
  open: boolean;
  onClose: () => void;
  regions: StoreRegion[];
  onAuthed: (c: Customer) => void;
  initialMode?: Mode;
}) {
  const t = useT();
  const err = useErr();
  const L = useLocalized();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [devCode, setDevCode] = useState("");
  const [f, setF] = useState({ id: "", password: "", name: "", phone: "", email: "", regionName: "", address: "", code: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setMsg("");
      setDevCode("");
    }
  }, [open, initialMode]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(err((e as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const r = await api<{ customer: Customer | null }>("/api/auth/customer");
    if (r.customer) {
      onAuthed(r.customer);
      onClose();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        await api("/api/auth/customer", { body: { action: "login", id: f.id, password: f.password } });
        await finish();
      } else if (mode === "register") {
        const r = await api("/api/auth/customer", {
          body: { action: "register", name: f.name, phone: f.phone, email: f.email, password: f.password, regionName: f.regionName, address: f.address },
        });
        setDevCode(r.devCode ?? "");
        setMode("otp");
      } else if (mode === "otp") {
        await api("/api/auth/customer", { body: { action: "verify", email: f.email, code: f.code } });
        await finish();
      } else if (mode === "forgot") {
        const r = await api("/api/auth/customer", { body: { action: "forgot", email: f.email } });
        setDevCode(r.devCode ?? "");
        setMode("reset");
      } else if (mode === "reset") {
        await api("/api/auth/customer", { body: { action: "reset", email: f.email, code: f.code, password: f.password } });
        toast(t("auth.resetDone"));
        await finish();
      }
    });
  };

  const resend = () =>
    run(async () => {
      const r = await api("/api/auth/customer", { body: { action: "resend", email: f.email, purpose: mode === "reset" ? "reset" : "signup" } });
      setDevCode(r.devCode ?? "");
    });

  const title =
    mode === "login" ? t("auth.welcome") : mode === "register" ? t("auth.registerTitle") : mode === "otp" ? t("auth.otpTitle") : t("auth.resetTitle");

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        {mode === "login" && (
          <>
            <input className="input" placeholder={t("auth.loginId")} value={f.id} onChange={set("id")} autoComplete="username" required />
            <input className="input" type="password" placeholder={t("common.password")} value={f.password} onChange={set("password")} autoComplete="current-password" required />
          </>
        )}

        {mode === "register" && (
          <>
            <p className="text-sm text-muted">{t("auth.registerHint")}</p>
            <input className="input" placeholder={t("common.name")} value={f.name} onChange={set("name")} required />
            <input className="input" type="tel" placeholder={t("common.phone")} value={f.phone} onChange={set("phone")} required />
            <input className="input" type="email" placeholder={t("common.email")} value={f.email} onChange={set("email")} required />
            <input className="input" type="password" minLength={6} placeholder={`${t("common.password")} — ${t("auth.passwordHint")}`} value={f.password} onChange={set("password")} autoComplete="new-password" required />
            <select className="input" value={f.regionName} onChange={set("regionName")} required>
              <option value="">{t("common.region")}…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.nameEn}>
                  {L(r.nameEn, r.nameAr)}
                </option>
              ))}
            </select>
            <textarea className="input" rows={2} placeholder={t("common.address")} value={f.address} onChange={set("address")} required />
          </>
        )}

        {(mode === "otp" || mode === "reset") && (
          <>
            <p className="text-sm text-muted">{t("auth.otpSent", { email: f.email })}</p>
            {devCode && <p className="card-2 p-3 text-sm font-bold text-accent">{t("auth.otpDemo", { code: devCode })}</p>}
            <input
              className="input text-center text-2xl font-black tracking-[0.5em]"
              inputMode="numeric"
              maxLength={6}
              placeholder="······"
              aria-label={t("auth.otpCode")}
              value={f.code}
              onChange={(e) => setF((s) => ({ ...s, code: e.target.value.replace(/\D/g, "") }))}
              required
            />
            {mode === "reset" && <input className="input" type="password" minLength={6} placeholder={t("auth.newPassword")} value={f.password} onChange={set("password")} required />}
          </>
        )}

        {mode === "forgot" && <input className="input" type="email" placeholder={t("common.email")} value={f.email} onChange={set("email")} required />}

        {msg && <p className="text-sm font-semibold text-bad">{msg}</p>}

        <button className="btn btn-primary w-full" disabled={busy}>
          {mode === "login" && t("auth.login")}
          {mode === "register" && t("auth.register")}
          {mode === "otp" && t("auth.otpVerify")}
          {mode === "forgot" && t("auth.resetSend")}
          {mode === "reset" && t("common.confirm")}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {mode === "login" && (
            <>
              <button type="button" className="font-semibold text-accent" onClick={() => setMode("register")}>
                {t("auth.noAccount")}
              </button>
              <button type="button" className="text-muted underline" onClick={() => setMode("forgot")}>
                {t("auth.forgot")}
              </button>
            </>
          )}
          {(mode === "register" || mode === "forgot") && (
            <button type="button" className="font-semibold text-accent" onClick={() => setMode("login")}>
              {t("auth.hasAccount")}
            </button>
          )}
          {(mode === "otp" || mode === "reset") && (
            <button type="button" className="font-semibold text-accent" onClick={resend} disabled={busy}>
              {t("auth.otpResend")}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
