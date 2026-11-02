"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, compressImage } from "@/lib/client";

/* ───────── toast ───────── */
type ToastMsg = { id: number; text: string; kind: "ok" | "err" };
export function toast(text: string, kind: "ok" | "err" = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("st-toast", { detail: { text, kind } }));
}
export function Toaster() {
  const [list, setList] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; kind: "ok" | "err" }>).detail;
      const id = Date.now() + Math.random();
      setList((l) => [...l.slice(-3), { id, ...d }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4200);
    };
    window.addEventListener("st-toast", h);
    return () => window.removeEventListener("st-toast", h);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {list.map((m) => (
        <div
          key={m.id}
          className={`pop-in pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl ${
            m.kind === "ok" ? "border-good/40 bg-surface text-ink" : "border-bad/50 bg-surface text-bad"
          }`}
        >
          {m.kind === "ok" ? "✓ " : "⚠ "}
          {m.text}
        </div>
      ))}
    </div>
  );
}

/* ───────── modal ───────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`pop-in card max-h-[92dvh] w-full overflow-y-auto p-5 sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} rounded-b-none sm:rounded-b-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="h-title">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───────── form bits ───────── */
export function Field({ label, children, hint, className = "" }: { label?: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 disabled:opacity-50"
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`} style={!checked ? { background: "rgba(255,255,255,.15)" } : undefined}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "start-[1.4rem]" : "start-0.5"}`}
          style={checked ? { background: "var(--accent-fg)" } : undefined}
        />
      </span>
      {label && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}

export function Spinner() {
  return <div className="mx-auto my-8 h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />;
}

/** Image with an emoji/gradient fallback when no photo has been uploaded yet. */
export function Img({ src, alt = "", emoji, className = "" }: { src?: string | null; alt?: string; emoji?: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: "linear-gradient(135deg, var(--surface), var(--surface-2))" }}
      aria-label={alt}
    >
      <span className="text-4xl opacity-90">{emoji || "🍽️"}</span>
    </div>
  );
}

/** File-picker based uploader (Browse / Upload from Studio). Stores the image in the database. */
export function ImageUploader({
  value,
  onChange,
  label,
  className = "",
  contain,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
  contain?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const file = await compressImage(f);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || "upload");
      onChange(j.url);
      toast("Image uploaded");
    } catch {
      toast("Upload failed (PNG/JPG/WebP up to 4MB)", "err");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className={`card-2 p-3 ${className}`}>
      {label && <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{label}</div>}
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-black/30">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className={`h-full w-full ${contain ? "object-contain" : "object-cover"}`} />
          ) : (
            <span className="text-2xl opacity-40">🖼️</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Uploading…" : "📁 Browse / Upload"}
          </button>
          {value && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── staff session bar ───────── */
export function LogoutButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await api("/api/auth/staff", { body: { action: "logout" } });
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-line">
      <button type="button" className="h-9 w-9 text-lg font-black hover:bg-surface" onClick={() => onChange(Math.max(min, value - 1))} aria-label="minus">
        −
      </button>
      <span className="w-8 text-center font-black">{value}</span>
      <button type="button" className="h-9 w-9 text-lg font-black hover:bg-surface" onClick={() => onChange(value + 1)} aria-label="plus">
        +
      </button>
    </div>
  );
}
