"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { TEXT_DEFAULTS, type TextOverrides } from "@/lib/defaults";
import { Field, ImageUploader, toast } from "@/components/ui";
import { adminErr, Panel } from "./shared";

/** Master text engine: every customer/POS/kitchen string, in English and Arabic. */
export function TextsEditor({ base }: { base: string }) {
  const [ov, setOv] = useState<TextOverrides | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    api<{ overrides: TextOverrides }>(base)
      .then((r) => {
        setOv(r.overrides);
        setEdits({});
      })
      .catch((e) => toast(adminErr(e), "err"));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    const s = q.trim().toLowerCase();
    for (const [k, v] of Object.entries(TEXT_DEFAULTS)) {
      if (s && !`${k} ${v.en} ${v.ar}`.toLowerCase().includes(s)) continue;
      (g[k.split(".")[0]] ??= []).push(k);
    }
    return Object.entries(g);
  }, [q]);

  if (!ov) return <p className="text-muted">Loading…</p>;

  const val = (lang: "en" | "ar", key: string) => edits[`${lang}|${key}`] ?? ov[lang][key] ?? "";
  const dirty = Object.keys(edits).length;

  const save = async () => {
    setSaving(true);
    try {
      const changes = Object.entries(edits).map(([k, value]) => {
        const [lang, ...rest] = k.split("|");
        return { lang, key: rest.join("|"), value };
      });
      await api(base, { method: "PUT", body: { changes } });
      toast(`${changes.length} text(s) saved`);
      await load();
    } catch (e) {
      toast(adminErr(e), "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Master text engine (EN / AR)"
      actions={
        <>
          <input className="input !min-h-9 !w-56 !py-1" placeholder="Search key or text…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={save}>
            Save {dirty ? `(${dirty})` : ""}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">Edit any sentence shown to customers, POS staff and the kitchen. Leave a field empty to use the default. Use {"{name}"}-style placeholders exactly as shown.</p>
      <div className="space-y-3">
        {groups.map(([g, keys]) => (
          <details key={g} className="card-2 p-3" open={!!q}>
            <summary className="cursor-pointer text-sm font-black uppercase tracking-wide text-accent">
              {g} <span className="text-muted">({keys.length})</span>
            </summary>
            <div className="mt-3 space-y-3">
              {keys.map((k) => (
                <div key={k} className="grid gap-2 border-t border-line pt-3 md:grid-cols-[12rem_1fr_1fr]">
                  <code className="break-all text-xs text-muted">{k}</code>
                  <input className="input" placeholder={TEXT_DEFAULTS[k].en} value={val("en", k)} onChange={(e) => setEdits({ ...edits, [`en|${k}`]: e.target.value })} />
                  <input className="input" dir="rtl" placeholder={TEXT_DEFAULTS[k].ar} value={val("ar", k)} onChange={(e) => setEdits({ ...edits, [`ar|${k}`]: e.target.value })} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}

type Profile = { nameEn: string; nameAr: string; taglineEn: string; taglineAr: string; emoji: string; heroImageUrl: string; cardImageUrl: string };

export function TruckProfile({ slug }: { slug: string }) {
  const base = `/api/admin/${slug}/profile`;
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => {
    api<Profile>(base).then(setP).catch((e) => toast(adminErr(e), "err"));
  }, [base]);
  if (!p) return null;
  return (
    <Panel
      title="Truck identity & images"
      actions={
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            try {
              await api(base, { method: "PUT", body: p });
              toast("Saved");
            } catch (e) {
              toast(adminErr(e), "err");
            }
          }}
        >
          Save
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English)"><input className="input" value={p.nameEn} onChange={(e) => setP({ ...p, nameEn: e.target.value })} /></Field>
        <Field label="Name (Arabic)"><input className="input" dir="rtl" value={p.nameAr} onChange={(e) => setP({ ...p, nameAr: e.target.value })} /></Field>
        <Field label="Tagline (English)"><input className="input" value={p.taglineEn} onChange={(e) => setP({ ...p, taglineEn: e.target.value })} /></Field>
        <Field label="Tagline (Arabic)"><input className="input" dir="rtl" value={p.taglineAr} onChange={(e) => setP({ ...p, taglineAr: e.target.value })} /></Field>
        <Field label="Emoji"><input className="input" maxLength={4} value={p.emoji} onChange={(e) => setP({ ...p, emoji: e.target.value })} /></Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ImageUploader label="Landing page card image" value={p.cardImageUrl} onChange={(u) => setP({ ...p, cardImageUrl: u })} />
        <ImageUploader label="Storefront hero background" value={p.heroImageUrl} onChange={(u) => setP({ ...p, heroImageUrl: u })} />
      </div>
    </Panel>
  );
}

export function ContentTab({ slug }: { slug: string }) {
  return (
    <div>
      <TruckProfile slug={slug} />
      <TextsEditor base={`/api/admin/${slug}/texts`} />
    </div>
  );
}
