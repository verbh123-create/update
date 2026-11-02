export const TRUCK_SLUGS = ["beverage", "food"] as const;
export type TruckSlug = (typeof TRUCK_SLUGS)[number];
export const isTruckSlug = (s: string): s is TruckSlug => (TRUCK_SLUGS as readonly string[]).includes(s);

export type Shift = { from: string; to: string };
export type DayHours = { closed: boolean; shifts: Shift[] };
export type Slot = { id: string; from: string; to: string };
export type Ingredient = {
  nameEn: string;
  nameAr: string;
  imageUrl: string;
  removable: boolean;
  addPrice: number; // > 0 => optional paid extra, 0 => included in the recipe
};

export type CartInput = { itemId: number; qty: number; removed?: number[]; extras?: number[] };

export type OrderLine = {
  itemId: number;
  nameEn: string;
  nameAr: string;
  qty: number;
  unitPrice: number;
  removed: number[];
  extras: number[];
  removedNames: { en: string; ar: string }[];
  extraNames: { en: string; ar: string; price: number }[];
  freeUnits: number;
};

export type Fulfillment = "delivery" | "pickup" | "dine_in";
export type PayMethod = "cash" | "benefit" | "card";
export type OrderStatus = "NOT_READY" | "COMPLETED" | "CANCELLED";

export interface OrderView {
  id: number;
  truckId: number;
  truckSlug: string;
  orderNo: string;
  accessToken?: string;
  kind: "direct" | "subscription" | "pos";
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  fulfillment: Fulfillment;
  address: string;
  regionName: string;
  deliveryFee: number;
  deliverySlot: string;
  items: OrderLine[];
  subtotal: number;
  couponCode: string;
  couponDiscount: number;
  loyaltyDiscount: number;
  subscriptionDiscount: number;
  total: number;
  paymentMethod: PayMethod;
  paymentStatus: "pending" | "paid" | "failed";
  status: OrderStatus;
  deliveryState: "pending" | "out" | "delivered";
  driverId: number | null;
  driverName: string | null;
  driverCommission: number;
  driverPaid: boolean;
  scheduledFor: string | null;
  subscriptionId: number | null;
  notes: string;
  createdAt: string;
  completedAt: string | null;
  modifyUntil: string | null;
  canModify: boolean;
}

export interface PublicSettings {
  theme: string;
  logoUrl: string;
  headerLogoUrl: string;
  receiptLogoUrl: string;
  heroBgUrl: string;
  whatsapp: string;
  mapQuery: string;
  mapLabel: string;
  loyaltyEnabled: boolean;
  subscriptionDiscount: number;
  cancelDirectMin: number;
  cancelSubMin: number;
  directAlertMin: number;
  subAlertMin: number;
  defaultLang: "en" | "ar";
}

export const PERMISSIONS = [
  "orders",
  "drivers",
  "reports",
  "menu",
  "hours",
  "regions",
  "promos",
  "payments",
  "customers",
  "employees",
  "content",
  "pos",
  "kitchen",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const ADMIN_PERMISSIONS = PERMISSIONS.filter((p) => p !== "pos" && p !== "kitchen");

export const THEMES = [
  { id: "neon-night", name: "Neon Night", colors: ["#121212", "#2A2A2A", "#FFE600"] },
  { id: "cyber-midnight", name: "Cyber Midnight", colors: ["#0A0E17", "#1E293B", "#06B6D4"] },
  { id: "warm-gourmet", name: "Warm Street Gourmet", colors: ["#18110D", "#2D1F17", "#F97316"] },
  { id: "minimal-luxe", name: "Minimal Luxe", colors: ["#0B0B0B", "#1F1F23", "#84CC16"] },
  { id: "vibrant-foodie", name: "Vibrant Foodie", colors: ["#161618", "#27272A", "#EF4444"] },
] as const;

export const DAY_KEYS = ["day.0", "day.1", "day.2", "day.3", "day.4", "day.5", "day.6"];
