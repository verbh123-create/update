import { notFound } from "next/navigation";
import Storefront from "@/components/store/Storefront";
import { getCustomer } from "@/lib/server/auth";
import { getTruck } from "@/lib/server/config";
import { loadStorefront } from "@/lib/server/logic";
import { isTruckSlug } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ truck: string }> }) {
  const { truck: slug } = await params;
  if (!isTruckSlug(slug)) notFound();
  const truck = await getTruck(slug);
  if (!truck) notFound();
  const [data, customer] = await Promise.all([loadStorefront(truck), getCustomer()]);
  return <Storefront initial={data} initialCustomer={customer} />;
}
