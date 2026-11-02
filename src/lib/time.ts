// All operating-hour logic runs in Bahrain local time (UTC+3, no DST).
export const TZ = "Asia/Bahrain";
export const OFFSET = "+03:00";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function bhParts(d: Date = new Date()) {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return { date, minutes, dow: dowOf(date), time: `${p.hour}:${p.minute}` };
}

export function dowOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function atBahrain(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00${OFFSET}`);
}

export function startOfDay(date: string): Date {
  return atBahrain(date, "00:00");
}

/** true when `minutes` falls inside [from, to) (supports overnight windows). */
export function inWindow(minutes: number, from: string, to: string): boolean {
  const f = toMin(from);
  const t = toMin(to);
  if (f === t) return true;
  if (f < t) return minutes >= f && minutes < t;
  return minutes >= f || minutes < t;
}

export function fmtDateTime(iso: string, lang: "en" | "ar" = "en"): string {
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-BH" : "en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const fmtMoney = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(3);
