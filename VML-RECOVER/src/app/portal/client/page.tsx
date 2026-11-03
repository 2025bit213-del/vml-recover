import { WorkspacePage } from "@/lib/workspace-page";
export const dynamic = "force-dynamic";
export default function ClientPortal() {
  return <WorkspacePage audience="client"/>;
}
