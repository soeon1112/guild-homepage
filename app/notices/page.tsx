import { Megaphone } from "lucide-react";

export default function NoticesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Megaphone size={48} className="text-accent-purple/50" />
        <h1 className="text-2xl font-bold">공지사항</h1>
        <p className="text-foreground/50">준비 중입니다</p>
      </div>
    </div>
  );
}
