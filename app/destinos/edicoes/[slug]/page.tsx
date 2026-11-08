import { notFound } from "next/navigation";
import { DestinosSiteHeader } from "@/features/institutional/components/InstitutionalHeader";
import { EditionGallery } from "@/features/famtour/PreviousEditionPage";
import { getPreviousEditionBySlug } from "@/features/famtour/lib/previousEditions";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const edition = getPreviousEditionBySlug(slug);
  if (!edition) notFound();
  return <><DestinosSiteHeader /><EditionGallery edition={edition} /></>;
}
