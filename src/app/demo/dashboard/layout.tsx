import { DashboardShell } from "@/components/agenda/DashboardShell";

export default function DemoDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
