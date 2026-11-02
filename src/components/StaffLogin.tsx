"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useErr, useSite, useT } from "@/components/I18n";
import { LangSwitch } from "@/components/I18n";
import { LogoutButton } from "@/components/ui";

export default function StaffLogin({ title, noAccess }: { title?: string; noAccess?: boolean }) {
  const t = useT();
  const err = useErr();
  const { settings } = useSite();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api("/api/auth/staff", { body: { username: u, password: p } });
      window.location.reload();
    } catch (x) {
      setMsg(err((x as { code?: string }).code));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="card pop-in w-full max-w-sm p-6">
        <div className="mb-5 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt="" className="h-12 w-auto rounded-lg" />}
          <LangSwitch />
        </div>
        <h1 className="h-title">{title ?? t("login.title")}</h1>
        {noAccess ? (
          <div className="mt-4 space-y-4">
            <p className="text-muted">{t("login.noAccess")}</p>
            <LogoutButton label={t("login.logout")} />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input className="input" placeholder={t("login.username")} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="none" required />
            <input className="input" type="password" placeholder={t("login.password")} value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
            {msg && <p className="text-sm font-semibold text-bad">{msg}</p>}
            <button className="btn btn-primary w-full" disabled={busy}>
              {t("login.submit")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
