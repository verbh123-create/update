"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { translate, type Lang, type TextOverrides } from "@/lib/defaults";
import type { PublicSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/time";

type SiteValue = { lang: Lang; settings: PublicSettings; overrides: TextOverrides };
const Ctx = createContext<SiteValue | null>(null);

export function SiteProvider({ value, children }: { value: SiteValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSite(): SiteValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("SiteProvider missing");
  return v;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function useT(): TFn {
  const { lang, overrides } = useSite();
  return useCallback((key, vars) => translate(overrides, lang, key, vars), [lang, overrides]);
}

/** Maps API error codes to translated messages. */
export function useErr(): (code?: string) => string {
  const t = useT();
  return useCallback(
    (code) => {
      const key = `err.${code ?? "generic"}`;
      const s = t(key);
      return s === key ? t("err.generic") : s;
    },
    [t],
  );
}

export function useMoney() {
  const t = useT();
  return useCallback((n: number) => `${fmtMoney(n)} ${t("common.currency")}`, [t]);
}

/** Picks the Arabic or English field depending on the active language. */
export function useLocalized() {
  const { lang } = useSite();
  return useCallback((en: string, ar?: string | null) => (lang === "ar" && ar ? ar : en), [lang]);
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang } = useSite();
  const t = useT();
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`}
      onClick={() => {
        document.cookie = `lang=${lang === "ar" ? "en" : "ar"}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      🌐 {t("common.switchLang")}
    </button>
  );
}
