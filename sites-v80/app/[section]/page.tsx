import { notFound, redirect } from "next/navigation";

export default async function SectionFallback({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "sources") redirect("/");
  notFound();
}
