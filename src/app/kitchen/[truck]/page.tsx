import { notFound } from "next/navigation";
import type { Metadata } from "next";
import KitchenDisplay from "@/components/kitchen/KitchenDisplay";
import StaffLogin from "@/components/StaffLogin";
import { canDo, getStaff } from "@/lib/server/auth";
import { getTruck } from "@/lib/server/config";
import { isTruckSlug } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kitchen", robots: { index: false, follow: false } };

export default async function KitchenPage({ params }: { params: Promise<{ truck: string }> }) {
  const { truck: slug } = await params;
  if (!isTruckSlug(slug)) notFound();
  const truck = await getTruck(slug);
  if (!truck) notFound();
  const staff = await getStaff();
  if (!staff) return <StaffLogin />;
  if (!canDo(staff, truck.id, "kitchen")) return <StaffLogin noAccess />;
  return <KitchenDisplay slug={truck.slug} nameEn={truck.nameEn} nameAr={truck.nameAr} />;
}
