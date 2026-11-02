import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TruckAdmin from "@/components/admin/TruckAdmin";
import StaffLogin from "@/components/StaffLogin";
import { canAdmin, getStaff } from "@/lib/server/auth";
import { getTruck } from "@/lib/server/config";
import { isTruckSlug } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage({ params }: { params: Promise<{ truck: string }> }) {
  const { truck: slug } = await params;
  if (!isTruckSlug(slug)) notFound();
  const truck = await getTruck(slug);
  if (!truck) notFound();
  const staff = await getStaff();
  if (!staff) return <StaffLogin title="Admin sign in" />;
  if (!canAdmin(staff, truck.id)) return <StaffLogin noAccess />;
  return (
    <TruckAdmin
      slug={truck.slug}
      truckName={truck.nameEn}
      staff={{ id: staff.id, name: staff.name || staff.username, isSuper: staff.isSuper, permissions: staff.permissions }}
    />
  );
}
