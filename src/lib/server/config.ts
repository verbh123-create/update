import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, siteTexts, trucks, staff, categories, items, regions, coupons, banners, drivers } from "@/db/schema";
import type { DayHours, Ingredient, PublicSettings } from "@/lib/types";
import type { Lang, TextOverrides } from "@/lib/defaults";
import { hashPassword } from "./auth";

export const SETTING_DEFAULTS: PublicSettings = {
  theme: "neon-night",
  logoUrl: "/images/logo.jpg",
  headerLogoUrl: "/images/logo.jpg",
  receiptLogoUrl: "/images/logo.jpg",
  heroBgUrl: "",
  whatsapp: "97333314261",
  mapQuery: "Manama, Bahrain",
  mapLabel: "Manama, Bahrain",
  loyaltyEnabled: true,
  subscriptionDiscount: 10,
  cancelDirectMin: 1,
  cancelSubMin: 60,
  directAlertMin: 3,
  subAlertMin: 5,
  defaultLang: "en",
};

const defaultHours = (): DayHours[] =>
  Array.from({ length: 7 }, () => ({ closed: false, shifts: [{ from: "08:00", to: "03:00" }] }));

const ing = (en: string, ar: string, removable = true, addPrice = 0): Ingredient => ({
  nameEn: en,
  nameAr: ar,
  imageUrl: "",
  removable,
  addPrice,
});

let seedPromise: Promise<void> | null = null;
export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((e) => {
      seedPromise = null;
      throw e;
    });
  }
  return seedPromise;
}

async function doSeed() {
  const existing = await db.select({ id: trucks.id }).from(trucks).limit(1);
  if (existing.length) return;

  const slots = [
    { id: "s1", from: "12:00", to: "14:00" },
    { id: "s2", from: "14:00", to: "16:00" },
    { id: "s3", from: "16:00", to: "18:00" },
    { id: "s4", from: "18:00", to: "20:00" },
    { id: "s5", from: "20:00", to: "22:00" },
  ];

  let bev, food;
  try {
    [bev] = await db
      .insert(trucks)
      .values({
        slug: "beverage",
        nameEn: "Beverage Truck",
        nameAr: "عربة المشروبات",
        taglineEn: "Cold brews, fresh juices & shakes",
        taglineAr: "قهوة باردة وعصائر طازجة وميلك شيك",
        emoji: "🥤",
        cardImageUrl: "/images/beverage-card.jpg",
        hours: defaultHours(),
        deliverySlots: slots,
        loyaltyThreshold: 10,
      })
      .returning();
    [food] = await db
      .insert(trucks)
      .values({
        slug: "food",
        nameEn: "Food Truck",
        nameAr: "عربة المأكولات",
        taglineEn: "Burgers, wraps & street bites",
        taglineAr: "برجر ولفائف ووجبات شوارع",
        emoji: "🍔",
        cardImageUrl: "/images/food-card.jpg",
        hours: defaultHours(),
        deliverySlots: slots,
        loyaltyThreshold: 10,
      })
      .returning();
  } catch {
    return; // another instance seeded concurrently
  }

  const pw = await hashPassword("Verde@123");
  const kpw = await hashPassword("12345678");
  await db
    .insert(staff)
    .values([
      { username: "ahmad", passwordHash: pw, name: "Ahmad (Super Admin)", role: "super", protected: true, permissions: [] },
      { username: "beverage", passwordHash: kpw, name: "Beverage Kitchen", role: "staff", truckId: bev.id, permissions: ["kitchen"] },
      { username: "kitchen", passwordHash: kpw, name: "Food Kitchen", role: "staff", truckId: food.id, permissions: ["kitchen"] },
    ])
    .onConflictDoNothing();

  const areas: [string, string, number][] = [
    ["Manama", "المنامة", 1],
    ["Seef", "السيف", 0.8],
    ["Juffair", "الجفير", 1],
    ["Muharraq", "المحرق", 1],
    ["Riffa", "الرفاع", 1.5],
    ["Isa Town", "مدينة عيسى", 1.5],
    ["Hamad Town", "مدينة حمد", 2],
    ["Sitra", "سترة", 1.5],
    ["Budaiya", "البديع", 1.5],
    ["Saar", "سار", 1.5],
  ];
  for (const t of [bev, food]) {
    await db.insert(regions).values(areas.map(([nameEn, nameAr, fee]) => ({ truckId: t.id, nameEn, nameAr, fee })));
    await db.insert(drivers).values({ truckId: t.id, name: "Driver 1", phone: "", defaultCommission: 0.5 });
    await db.insert(banners).values({
      truckId: t.id,
      kind: "popup",
      titleEn: "Welcome to Street Taste! 🎉",
      titleAr: "أهلاً بك في ستريت تيست! 🎉",
      bodyEn: "Use code WELCOME10 for 10% off your first order.",
      bodyAr: "استخدم الكود WELCOME10 للحصول على خصم 10% على طلبك الأول.",
    });
  }
  await db.insert(coupons).values({ truckId: null, code: "WELCOME10", type: "percent", value: 10 });

  type Seed = [number, string, string, number, string, string[], Ingredient[]?];
  const mk = async (truckId: number, cats: [string, string, string, string?, string?][], list: Seed[]) => {
    const ids: number[] = [];
    for (let i = 0; i < cats.length; i++) {
      const [nameEn, nameAr, , from, to] = cats[i];
      const [c] = await db.insert(categories).values({ truckId, nameEn, nameAr, sort: i, timeFrom: from ?? null, timeTo: to ?? null }).returning();
      ids.push(c.id);
    }
    let n = 0;
    for (const [ci, nameEn, nameAr, price, emoji, tags, ingredients] of list) {
      await db.insert(items).values({
        truckId,
        categoryId: ids[ci],
        nameEn,
        nameAr,
        price,
        emoji,
        tags,
        ingredients: ingredients ?? [],
        descEn: "",
        descAr: "",
        sort: n++,
      });
    }
  };

  await mk(
    bev.id,
    [
      ["Coffee", "قهوة", "☕"],
      ["Fresh Juices", "عصائر طازجة", "🍊"],
      ["Shakes & Smoothies", "ميلك شيك وسموذي", "🥤"],
      ["Morning Boost", "إفطار الصباح", "🌅", "06:00", "12:00"],
    ],
    [
      [0, "Iced Latte", "آيس لاتيه", 1.8, "☕", ["fresh"], [ing("Espresso", "إسبريسو", false), ing("Milk", "حليب"), ing("Ice", "ثلج"), ing("Caramel syrup", "صلصة كراميل", true, 0.3), ing("Extra shot", "شوت إضافي", true, 0.5)]],
      [0, "Cold Brew", "كولد برو", 1.6, "🧊", ["fresh"]],
      [0, "Spanish Latte", "سبانش لاتيه", 2.0, "☕", []],
      [1, "Fresh Orange Juice", "عصير برتقال طازج", 1.5, "🍊", ["fresh"]],
      [1, "Mango Juice", "عصير مانجو", 1.7, "🥭", ["fresh"]],
      [1, "Lemon Mint", "ليمون بالنعناع", 1.4, "🍋", ["fresh"]],
      [2, "Berry Blast Smoothie", "سموذي التوت", 2.2, "🫐", ["fresh"]],
      [2, "Chocolate Shake", "ميلك شيك شوكولاتة", 2.0, "🍫", []],
      [3, "Oat Morning Smoothie", "سموذي الشوفان", 1.9, "🥣", ["fresh"]],
      [3, "Karak Tea", "شاي كرك", 0.6, "🍵", []],
    ],
  );
  await mk(
    food.id,
    [
      ["Burgers", "برجر", "🍔"],
      ["Sandwiches & Wraps", "ساندويتشات ولفائف", "🌯"],
      ["Sides", "مقبلات", "🍟"],
      ["Breakfast", "إفطار", "🍳", "07:00", "11:30"],
    ],
    [
      [0, "Street Smash Burger", "ستريت سماش برجر", 2.8, "🍔", [], [ing("Beef patty", "قطعة لحم", false), ing("Cheese slice", "شريحة جبن"), ing("Pickles", "مخلل"), ing("Onions", "بصل"), ing("Special sauce", "الصلصة الخاصة"), ing("Extra patty", "قطعة لحم إضافية", true, 1), ing("Jalapeños", "هالبينو", true, 0.2)]],
      [0, "Spicy Chicken Burger", "برجر دجاج حار", 2.6, "🌶️", ["spicy"]],
      [1, "Chicken Shawarma Wrap", "لفافة شاورما دجاج", 1.8, "🌯", [], [ing("Chicken", "دجاج", false), ing("Garlic sauce", "صلصة ثوم"), ing("Pickles", "مخلل"), ing("Fries inside", "بطاطس", true, 0.2)]],
      [1, "Beef Shawarma", "شاورما لحم", 2.0, "🌯", []],
      [1, "Falafel Sandwich", "ساندويتش فلافل", 1.2, "🧆", ["fresh"]],
      [2, "Loaded Fries", "بطاطس محملة", 1.9, "🍟", ["spicy"]],
      [2, "Classic Fries", "بطاطس كلاسيك", 1.0, "🍟", []],
      [3, "Shakshuka Sandwich", "ساندويتش شكشوكة", 1.5, "🍳", ["fresh"]],
      [3, "Foul & Egg Wrap", "لفافة فول وبيض", 1.1, "🌯", []],
    ],
  );
}

export const getSettings = cache(async (): Promise<PublicSettings> => {
  await ensureSeed();
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (!(r.key in SETTING_DEFAULTS)) continue;
    // values are wrapped as { v } because drizzle's jsonb mapper would JSON.parse bare strings like "33314261"
    const raw = r.value as { v?: unknown } | null;
    out[r.key] = raw && typeof raw === "object" && "v" in raw ? raw.v : raw;
  }
  return out as unknown as PublicSettings;
});

export async function saveSettings(patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    const def = SETTING_DEFAULTS[key as keyof PublicSettings];
    let v: unknown = value;
    if (typeof def === "number") v = Number(value);
    else if (typeof def === "boolean") v = Boolean(value);
    else v = String(value ?? "");
    if (typeof def === "number" && !Number.isFinite(v as number)) continue;
    await db.insert(settings).values({ key, value: { v } }).onConflictDoUpdate({ target: settings.key, set: { value: { v } } });
  }
}

export const getTextOverrides = cache(async (): Promise<TextOverrides> => {
  await ensureSeed();
  const rows = await db.select().from(siteTexts);
  const out: TextOverrides = { en: {}, ar: {} };
  for (const r of rows) if (r.lang === "en" || r.lang === "ar") out[r.lang][r.key] = r.value;
  return out;
});

export async function saveTexts(changes: { key: string; lang: string; value: string }[]) {
  for (const c of changes) {
    if (c.lang !== "en" && c.lang !== "ar") continue;
    if (!c.key || c.key.length > 100) continue;
    if (!c.value) {
      await db.delete(siteTexts).where(and(eq(siteTexts.key, c.key), eq(siteTexts.lang, c.lang)));
      continue;
    }
    await db
      .insert(siteTexts)
      .values({ key: c.key, lang: c.lang, value: c.value.slice(0, 2000) })
      .onConflictDoUpdate({ target: [siteTexts.key, siteTexts.lang], set: { value: c.value.slice(0, 2000) } });
  }
}

export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get("lang")?.value;
  if (c === "ar" || c === "en") return c;
  return (await getSettings()).defaultLang === "ar" ? "ar" : "en";
});

export const getTruck = cache(async (slug: string) => {
  await ensureSeed();
  const [t] = await db.select().from(trucks).where(eq(trucks.slug, slug)).limit(1);
  return t ?? null;
});

export const getTrucks = cache(async () => {
  await ensureSeed();
  return db.select().from(trucks).orderBy(trucks.id);
});
