import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import type { DayHours, Slot, Ingredient, OrderLine } from "@/lib/types";

const money = (name: string) => numeric(name, { precision: 12, scale: 3, mode: "number" });

export const trucks = pgTable("trucks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  taglineEn: text("tagline_en").notNull().default(""),
  taglineAr: text("tagline_ar").notNull().default(""),
  emoji: text("emoji").notNull().default("🍔"),
  heroImageUrl: text("hero_image_url").notNull().default(""),
  cardImageUrl: text("card_image_url").notNull().default(""),
  status: text("status").notNull().default("open"), // open | busy | closed
  hours: jsonb("hours").$type<DayHours[]>().notNull(),
  closedDates: jsonb("closed_dates").$type<string[]>().notNull().default([]),
  deliverySlots: jsonb("delivery_slots").$type<Slot[]>().notNull().default([]),
  payCash: boolean("pay_cash").notNull().default(true),
  payBenefit: boolean("pay_benefit").notNull().default(true),
  payCard: boolean("pay_card").notNull().default(false),
  benefitQrUrl: text("benefit_qr_url").notNull().default(""),
  benefitIban: text("benefit_iban").notNull().default(""),
  benefitName: text("benefit_name").notNull().default(""),
  gatewayProvider: text("gateway_provider").notNull().default("tap"), // tap | myfatoorah
  gatewayMode: text("gateway_mode").notNull().default("test"),
  gatewayPublicKey: text("gateway_public_key").notNull().default(""),
  gatewaySecretKey: text("gateway_secret_key").notNull().default(""),
  gatewayWebhookSecret: text("gateway_webhook_secret").notNull().default(""),
  loyaltyThreshold: integer("loyalty_threshold").notNull().default(10),
  minOrder: money("min_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});

export const siteTexts = pgTable(
  "site_texts",
  {
    key: text("key").notNull(),
    lang: text("lang").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.lang] })],
);

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    truckId: integer("truck_id").notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
    timeFrom: text("time_from"),
    timeTo: text("time_to"),
  },
  (t) => [index("categories_truck_idx").on(t.truckId)],
);

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    truckId: integer("truck_id").notNull(),
    categoryId: integer("category_id").notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull().default(""),
    descEn: text("desc_en").notNull().default(""),
    descAr: text("desc_ar").notNull().default(""),
    price: money("price").notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    emoji: text("emoji").notNull().default(""),
    active: boolean("active").notNull().default(true),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ingredients: jsonb("ingredients").$type<Ingredient[]>().notNull().default([]),
    stock: integer("stock"), // null = unlimited
    loyaltyEligible: boolean("loyalty_eligible").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("items_truck_idx").on(t.truckId)],
);

export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull().default(""),
  fee: money("fee").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id"), // null = all trucks
  code: text("code").notNull(),
  type: text("type").notNull().default("percent"), // percent | fixed
  value: money("value").notNull().default(0),
  minOrder: money("min_order").notNull().default(0),
  startsOn: text("starts_on"), // YYYY-MM-DD
  endsOn: text("ends_on"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id"), // null = all trucks
  kind: text("kind").notNull().default("popup"), // popup | banner
  titleEn: text("title_en").notNull().default(""),
  titleAr: text("title_ar").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  bodyAr: text("body_ar").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  startsOn: text("starts_on"),
  endsOn: text("ends_on"),
  active: boolean("active").notNull().default(true),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  regionName: text("region_name").notNull().default(""),
  address: text("address").notNull().default(""),
  loyalty: jsonb("loyalty").$type<Record<string, number>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otps = pgTable("otps", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(), // signup | reset
  codeHash: text("code_hash").notNull(),
  payload: jsonb("payload").$type<Record<string, string> | null>(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("staff"), // super | staff
  truckId: integer("truck_id"), // null = all trucks
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  protected: boolean("protected").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  defaultCommission: money("default_commission").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  customerId: integer("customer_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: jsonb("days").$type<number[]>().notNull(),
  slotLabel: text("slot_label").notNull().default(""),
  status: text("status").notNull().default("active"), // active | cancelled
  discountPercent: money("discount_percent").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  truckId: integer("truck_id").notNull(),
  driverId: integer("driver_id").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  amount: money("amount").notNull().default(0),
  deliveries: integer("deliveries").notNull().default(0),
  paidBy: text("paid_by").notNull().default(""),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    truckId: integer("truck_id").notNull(),
    orderNo: text("order_no").notNull().default(""),
    accessToken: text("access_token").notNull().default(""),
    kind: text("kind").notNull().default("direct"), // direct | subscription | pos
    customerId: integer("customer_id"),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    guestEmail: text("guest_email"),
    fulfillment: text("fulfillment").notNull().default("pickup"), // delivery | pickup | dine_in
    address: text("address").notNull().default(""),
    regionId: integer("region_id"),
    regionName: text("region_name").notNull().default(""),
    deliveryFee: money("delivery_fee").notNull().default(0),
    deliverySlot: text("delivery_slot").notNull().default(""),
    items: jsonb("items").$type<OrderLine[]>().notNull(),
    subtotal: money("subtotal").notNull().default(0),
    couponCode: text("coupon_code").notNull().default(""),
    couponDiscount: money("coupon_discount").notNull().default(0),
    loyaltyDiscount: money("loyalty_discount").notNull().default(0),
    subscriptionDiscount: money("subscription_discount").notNull().default(0),
    total: money("total").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("cash"), // cash | benefit | card
    paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid | failed
    paymentRef: text("payment_ref").notNull().default(""),
    status: text("status").notNull().default("NOT_READY"), // NOT_READY | COMPLETED | CANCELLED
    deliveryState: text("delivery_state").notNull().default("pending"), // pending | out | delivered
    driverId: integer("driver_id"),
    driverCommission: money("driver_commission").notNull().default(0),
    driverPaid: boolean("driver_paid").notNull().default(false),
    payoutId: integer("payout_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    subscriptionId: integer("subscription_id"),
    loyaltyEarned: integer("loyalty_earned").notNull().default(0),
    loyaltyRedeemed: integer("loyalty_redeemed").notNull().default(0),
    couponId: integer("coupon_id"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [index("orders_truck_created_idx").on(t.truckId, t.createdAt), index("orders_customer_idx").on(t.customerId)],
);
