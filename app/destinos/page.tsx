import { Suspense } from "react";
import { DestinosSiteHeader } from "@/features/institutional/components/InstitutionalHeader";
import { FamtourLanding } from "@/features/famtour/FamtourLanding";

export default function Page() {
  return <><DestinosSiteHeader /><Suspense><FamtourLanding /></Suspense></>;
}
