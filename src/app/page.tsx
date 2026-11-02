import Link from "next/link";
import { getLang, getSettings, getTextOverrides, getTrucks } from "@/lib/server/config";
import { openState } from "@/lib/server/logic";
import { translate } from "@/lib/defaults";
import { mapEmbedSrc, mapLink, whatsappLink } from "@/lib/maps";
import { LangSwitch } from "@/components/I18n";
import { Img } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, overrides, lang, trucks] = await Promise.all([getSettings(), getTextOverrides(), getLang(), getTrucks()]);
  const t = (k: string) => translate(overrides, lang, k);
  const wa = whatsappLink(settings.whatsapp);

  const cards = [
    { slug: "beverage", href: "/beverage", title: t("landing.beverage.title"), desc: t("landing.beverage.desc"), emoji: "🥤" },
    { slug: "food", href: "/food", title: t("landing.food.title"), desc: t("landing.food.desc"), emoji: "🍔" },
  ].map((c) => {
    const truck = trucks.find((x) => x.slug === c.slug);
    const st = truck ? openState(truck) : { open: false, busy: false };
    const status = !truck || !st.open ? "closed" : st.busy ? "busy" : "open";
    return { ...c, image: truck?.cardImageUrl ?? "", status };
  });

  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={
          settings.heroBgUrl
            ? { background: `linear-gradient(rgba(0,0,0,.72), var(--bg)), url(${settings.heroBgUrl}) center/cover no-repeat` }
            : { background: "radial-gradient(60rem 30rem at 50% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent), var(--bg)" }
        }
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.headerLogoUrl && <img src={settings.headerLogoUrl} alt={t("landing.title")} className="h-12 w-auto rounded-lg sm:h-14" />}
        </div>
        <LangSwitch />
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 text-center sm:px-6 sm:pt-10">
        <span className="chip chip-accent">★ {t("landing.badge")}</span>
        <h1 className="h-display mt-5">{t("landing.title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-[clamp(1rem,0.9rem+0.5vw,1.25rem)] text-muted">{t("landing.subtitle")}</p>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.25em] text-accent">{t("landing.choose")}</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.slug} href={c.href} className="card glow group relative block overflow-hidden rounded-3xl transition hover:-translate-y-1">
            <div className="relative aspect-[16/9] overflow-hidden">
              <Img src={c.image} emoji={c.emoji} className="h-full w-full transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className={`chip absolute end-3 top-3 ${c.status === "open" ? "chip-good" : c.status === "busy" ? "chip-accent" : "chip-bad"}`}>
                ● {t(`landing.status.${c.status}`)}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              <h2 className="h-title">{c.title}</h2>
              <p className="mt-1 text-muted">{c.desc}</p>
              <div className="btn btn-primary mt-5 w-full">
                {t("landing.cta")} <span className="inline-block rtl:rotate-180">→</span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
        <div className="card overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="h-title">📍 {t("landing.map.title")}</h2>
              <p className="text-muted">
                {t("landing.map.subtitle")}
                {settings.mapLabel ? ` — ${settings.mapLabel}` : ""}
              </p>
            </div>
            <a href={mapLink(settings.mapQuery, settings.mapLabel)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              {t("landing.map.open")} ↗
            </a>
          </div>
          <iframe
            title="map"
            src={mapEmbedSrc(settings.mapQuery, settings.mapLabel)}
            className="h-[22rem] w-full border-0 sm:h-[26rem]"
            style={{ filter: "invert(0.92) hue-rotate(180deg) saturate(0.7) contrast(0.95)" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-4 text-center sm:px-6">
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary text-base">
          <WhatsAppIcon /> {t("landing.whatsapp")}
        </a>
      </section>

      <footer className="mx-auto mt-14 max-w-6xl px-4 pb-24 text-center text-sm text-muted sm:px-6">{t("landing.footer")}</footer>

      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        className="fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-110"
      >
        <WhatsAppIcon size={30} />
      </a>
    </main>
  );
}

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-1.7-.8-2.8-1.5-3.9-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4zM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2z" />
    </svg>
  );
}
