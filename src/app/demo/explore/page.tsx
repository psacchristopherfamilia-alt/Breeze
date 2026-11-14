import { ExploreView } from "@/components/explore/ExploreView";
import { mockSalons } from "@/lib/mock/explore";

export default function DemoExplorePage() {
  return <ExploreView salons={mockSalons()} />;
}
