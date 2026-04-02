import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getProfileDataService } from "@/lib/profile-data-service";
import ProfileDetailClient from "./ProfileDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

const getProfilePageData = cache(async (id: string) => {
  const svc = getProfileDataService();
  const dataset = await svc.getDataset(false);
  const profile = dataset.profiles.find((p) => p.id === id);
  return { dataset, profile: profile ?? null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await getProfilePageData(id);
  if (!profile) {
    return { title: "Profile not found" };
  }
  return {
    title: `${profile.name} · The Marque`,
    description: [profile.title, profile.company].filter(Boolean).join(" · ") || "Profile",
  };
}

export default async function ProfileDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { dataset, profile } = await getProfilePageData(id);
  if (!profile) notFound();

  return <ProfileDetailClient profile={profile} cachedAt={dataset.cachedAt} />;
}
