import type { Metadata } from "next";
import GlobalAdmin from "@/components/admin/GlobalAdmin";
import StaffLogin from "@/components/StaffLogin";
import { getStaff } from "@/lib/server/auth";
import { getTrucks } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Super Admin", robots: { index: false, follow: false } };

export default async function GlobalAdminPage() {
  const staff = await getStaff();
  if (!staff) return <StaffLogin title="Super admin sign in" />;
  if (!staff.isSuper) return <StaffLogin noAccess />;
  const trucks = await getTrucks();
  return (
    <GlobalAdmin
      staff={{ id: staff.id, name: staff.name || staff.username, isSuper: true, permissions: [] }}
      trucks={trucks.map((t) => ({ id: t.id, slug: t.slug, name: t.nameEn }))}
    />
  );
}
