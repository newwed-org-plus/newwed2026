import type { Metadata } from "next";
import { ProjectPage } from "@/features/institutional/components/ProjectPage";
import { institutionalProjects } from "@/features/institutional/projects";

export const metadata: Metadata = {
  title: "New Wed Workshop · Grupo New Wed",
  description: institutionalProjects.workshop.description,
};

export default function Page() {
  return <ProjectPage projectId="workshop" />;
}
