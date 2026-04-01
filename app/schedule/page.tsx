import Link from "next/link";
import Image from "next/image";

export default function SchedulePage() {
  return (
    <div
      className="relative min-h-screen w-full bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/images/background.png')" }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-6">
        <div className="w-full max-w-4xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full bg-black/30 px-4 py-2 text-sm text-white/80 backdrop-blur-sm hover:text-white"
          >
            ← 홈으로
          </Link>
        </div>

        <div className="mt-4 flex w-full max-w-4xl flex-1 items-start justify-center">
          <Image
            src="/images/schedule-page.png"
            alt="일정"
            width={1200}
            height={1600}
            className="w-full h-auto"
            style={{ filter: "none" }}
            priority
          />
        </div>
      </div>
    </div>
  );
}
