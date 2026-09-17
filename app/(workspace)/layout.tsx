import { WritingOSProvider } from "@/app/lib/writing-os/context";
import { Sidebar } from "@/app/components/sidebar/Sidebar";
import { LastPathTracker } from "@/app/components/shared/LastPathTracker";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WritingOSProvider>
      <LastPathTracker />
      <div className="flex w-full min-h-[900px] h-dvh bg-[var(--surface-app)] overflow-hidden font-sans">
        <Sidebar />
        <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain relative">{children}</div>
      </div>
    </WritingOSProvider>
  );
}
