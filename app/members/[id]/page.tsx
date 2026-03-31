import Link from "next/link";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="member-detail">
      <Link href="/members" className="back-link">
        ← 돌아가기
      </Link>
      <img
        src={`/images/members/detail/${id}.png`}
        alt={`멤버 ${id}`}
        className="member-detail-img"
      />
    </div>
  );
}
