import { MockBooking } from "@/components/booking/MockBooking";

export default async function DemoSalonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reschedule?: string }>;
}) {
  const { slug } = await params;
  const { reschedule } = await searchParams;
  return <MockBooking slug={slug} rescheduleGroup={reschedule} />;
}
