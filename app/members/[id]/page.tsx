import Link from "next/link";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="member-detail">
      <p className="member-detail-text">준비 중입니다</p>
      <Link href="/members" className="back-link">
        ← 돌아가기
      </Link>
    </div>
  );
}
