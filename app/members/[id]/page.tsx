import Link from "next/link";

const preparingIds = new Set<string>([]);

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
      {preparingIds.has(id) ? (
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "1.1rem" }}>
          준비 중입니다
        </p>
      ) : (
        <img
          src={`/images/members/detail/${id}.png`}
          alt={`멤버 ${id}`}
          className="member-detail-img"
        />
      )}
    </div>
  );
}
