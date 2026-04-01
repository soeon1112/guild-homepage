import Link from "next/link";

export default function SchedulePage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8">
      <div className="w-full max-w-4xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
          ← 홈으로
        </Link>
      </div>
      <div className="flex w-full flex-1 items-center justify-center">
        <img
          src="/images/schedule-page.png"
          alt="일정"
          className="w-full max-w-4xl"
        />
      </div>
    </div>
  );
}
