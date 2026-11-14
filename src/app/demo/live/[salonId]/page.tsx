import { MockLive } from "@/components/live/MockLive";

export default async function DemoLivePage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId: slug } = await params;
  return <MockLive slug={slug} />;
}
