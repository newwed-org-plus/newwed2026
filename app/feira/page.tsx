import type { Metadata } from "next";
import { ProjectPage } from "@/features/institutional/components/ProjectPage";
import { institutionalProjects } from "@/features/institutional/projects";

export const metadata: Metadata = {
  title: "New Wed Feira · Grupo New Wed",
  description: institutionalProjects.feira.description,
};

export default function Page() {
  return <ProjectPage projectId="feira" />;
}
