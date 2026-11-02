import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteProvider } from "@/components/I18n";
import { Toaster } from "@/components/ui";
import { SETTING_DEFAULTS, getLang, getSettings, getTextOverrides } from "@/lib/server/config";
import { translate, type Lang, type TextOverrides } from "@/lib/defaults";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [settings, overrides, lang] = await Promise.all([
    safe(getSettings, SETTING_DEFAULTS),
    safe(getTextOverrides, { en: {}, ar: {} } as TextOverrides),
    safe(getLang, "en" as Lang),
  ]);
  return {
    title: translate(overrides, lang, "landing.title"),
    description: translate(overrides, lang, "landing.subtitle"),
    icons: { icon: settings.logoUrl },
  };
}

export const viewport: Viewport = { themeColor: "#121212", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, overrides, lang] = await Promise.all([
    safe(getSettings, SETTING_DEFAULTS),
    safe(getTextOverrides, { en: {}, ar: {} } as TextOverrides),
    safe(getLang, "en" as Lang),
  ]);
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-theme={settings.theme}>
      <body>
        <SiteProvider value={{ lang, settings, overrides }}>
          {children}
          <Toaster />
        </SiteProvider>
      </body>
    </html>
  );
}
