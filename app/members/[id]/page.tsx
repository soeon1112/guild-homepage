import Link from "next/link";

const detailIds = new Set(["1", "1-2", "3", "4", "7", "8", "10", "12", "13", "15", "17", "21"]);

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hasDetail = detailIds.has(id);

  if (hasDetail) {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-8">
        <div className="w-full max-w-4xl">
          <Link href="/members" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
            ← 돌아가기
          </Link>
        </div>
        <div className="flex w-full flex-1 items-center justify-center">
          <img
            src={`/images/members/detail/${id}.png`}
            alt={`멤버 ${id}`}
            className="w-full max-w-4xl"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-8"
      style={{ background: "url('/images/background.png') center center / cover no-repeat fixed" }}
    >
      <p className="mb-8 text-lg text-white">준비 중입니다</p>
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white/80"
      >
        ← 돌아가기
      </Link>
    </div>
  );
}
