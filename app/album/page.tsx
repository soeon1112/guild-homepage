import { ImageIcon } from "lucide-react";
import Link from "next/link";

export default function AlbumPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
        ← 홈으로
      </Link>
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <ImageIcon size={48} className="text-accent-purple/50" />
        <h1 className="text-2xl font-bold">앨범</h1>
        <p className="text-foreground/50">준비 중입니다</p>
      </div>
    </div>
  );
}
