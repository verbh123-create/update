import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PosTerminal from "@/components/pos/PosTerminal";
import StaffLogin from "@/components/StaffLogin";
import { canDo, getStaff } from "@/lib/server/auth";
import { getTruck } from "@/lib/server/config";
import { loadStorefront } from "@/lib/server/logic";
import { isTruckSlug } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "POS", robots: { index: false, follow: false } };

export default async function PosPage({ params }: { params: Promise<{ truck: string }> }) {
  const { truck: slug } = await params;
  if (!isTruckSlug(slug)) notFound();
  const truck = await getTruck(slug);
  if (!truck) notFound();
  const staff = await getStaff();
  if (!staff) return <StaffLogin />;
  if (!canDo(staff, truck.id, "pos")) return <StaffLogin noAccess />;
  return <PosTerminal data={await loadStorefront(truck)} staffName={staff.name || staff.username} />;
}
