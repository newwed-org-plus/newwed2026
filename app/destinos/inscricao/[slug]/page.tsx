import { notFound } from "next/navigation";
import { InscricaoPage } from "@/features/famtour/RegistrationPage";
import { getFamtourBySlug } from "@/features/famtour/lib/famtours";

export default async function Page({params,searchParams}:{
  params:Promise<{slug:string}>;
  searchParams:Promise<{checkout?:string|string[]}>;
}) {
  const [{slug},{checkout}] = await Promise.all([params,searchParams]);
  const edition = getFamtourBySlug(slug);
  if (!edition) notFound();
  const checkoutId = typeof checkout==="string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(checkout) ? checkout : undefined;
  return <InscricaoPage edition={edition} checkoutId={checkoutId}/>;
}
