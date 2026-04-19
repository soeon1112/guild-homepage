import BackLink from "@/app/components/BackLink";

const detailIds = new Set(["0", "1", "1-2", "2", "3", "4", "5", "6", "7", "8", "9", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"]);

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hasDetail = detailIds.has(id);

  if (id === "a") {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-8">
        <div className="w-full max-w-4xl">
          <BackLink href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
            ← 홈으로
          </BackLink>
        </div>
        <div className="flex w-full flex-1 items-center justify-center">
          <img
            src="/images/members/detail/a.png"
            alt="길드 규칙"
            className="w-full max-w-4xl"
          />
        </div>
      </div>
    );
  }

  if (hasDetail) {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-8">
        <div className="w-full max-w-4xl">
          <BackLink href="/members" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
            ← 돌아가기
          </BackLink>
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
    <div className="flex min-h-screen flex-col items-center px-4 py-8">
      <div className="w-full max-w-4xl">
        <BackLink href="/members" className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/50 hover:text-foreground/80">
          ← 돌아가기
        </BackLink>
      </div>
      <div className="flex w-full flex-1 items-center justify-center">
        <p className="text-lg text-white">준비 중입니다</p>
      </div>
    </div>
  );
}
