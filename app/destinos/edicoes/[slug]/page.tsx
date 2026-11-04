import { notFound } from "next/navigation";
import { EditionGallery } from "@/features/famtour/PreviousEditionPage";
import { getPreviousEditionBySlug } from "@/features/famtour/lib/previousEditions";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const edition = getPreviousEditionBySlug(slug);
  if (!edition) notFound();
  return <EditionGallery edition={edition} />;
}
