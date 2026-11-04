import { notFound } from "next/navigation";
import { InscricaoPage } from "@/features/famtour/RegistrationPage";
import { getFamtourBySlug } from "@/features/famtour/lib/famtours";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const edition = getFamtourBySlug(slug);
  if (!edition) notFound();
  return <InscricaoPage edition={edition} />;
}
