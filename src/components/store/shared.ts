"use client";

import { useCallback, useEffect, useState } from "react";
import type { StorefrontData } from "@/lib/server/logic";
import type { CartInput } from "@/lib/types";

export type StoreData = StorefrontData;
export type StoreItem = StorefrontData["items"][number];
export type StoreCat = StorefrontData["categories"][number];
export type StoreRegion = StorefrontData["regions"][number];
export type StoreTruck = StorefrontData["truck"];
export type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  regionName: string;
  address: string;
  loyalty: Record<string, number>;
};
export type CartLine = { key: string; itemId: number; qty: number; removed: number[]; extras: number[] };

export const lineKey = (itemId: number, removed: number[], extras: number[]) =>
  `${itemId}|${[...removed].sort().join(",")}|${[...extras].sort().join(",")}`;

export const toCartInput = (lines: CartLine[]): CartInput[] =>
  lines.map((l) => ({ itemId: l.itemId, qty: l.qty, removed: l.removed, extras: l.extras }));

export const lineUnit = (item: StoreItem, extras: number[]) =>
  item.price + extras.reduce((s, i) => s + (item.ingredients[i]?.addPrice ?? 0), 0);

export function optionText(item: StoreItem, line: { removed: number[]; extras: number[] }, L: (en: string, ar?: string | null) => string, noLabel: string) {
  const parts: string[] = [];
  for (const i of line.removed) parts.push(`${noLabel} ${L(item.ingredients[i]?.nameEn ?? "", item.ingredients[i]?.nameAr)}`);
  for (const i of line.extras) parts.push(`+ ${L(item.ingredients[i]?.nameEn ?? "", item.ingredients[i]?.nameAr)}`);
  return parts.join(" · ");
}

export function useCart(slug: string) {
  const key = `st-cart-${slug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) localStorage.setItem(key, JSON.stringify(lines));
  }, [lines, ready, key]);

  const add = useCallback((l: Omit<CartLine, "key">) => {
    const k = lineKey(l.itemId, l.removed, l.extras);
    setLines((cur) => {
      const ex = cur.find((x) => x.key === k);
      if (ex) return cur.map((x) => (x.key === k ? { ...x, qty: Math.min(50, x.qty + l.qty) } : x));
      return [...cur, { ...l, key: k }];
    });
  }, []);
  const setQty = useCallback((k: string, qty: number) => {
    setLines((cur) => (qty <= 0 ? cur.filter((x) => x.key !== k) : cur.map((x) => (x.key === k ? { ...x, qty: Math.min(50, qty) } : x))));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  return { lines, add, setQty, clear, setLines };
}

export function useGuestRefs(slug: string) {
  const key = `st-refs-${slug}`;
  const read = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  }, [key]);
  const push = useCallback(
    (id: number, token: string) => {
      const cur = read().filter((r) => !r.startsWith(`${id}:`));
      localStorage.setItem(key, JSON.stringify([`${id}:${token}`, ...cur].slice(0, 25)));
    },
    [key, read],
  );
  return { read, push };
}

export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function countdown(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
}
