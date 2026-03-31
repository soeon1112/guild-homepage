import Link from "next/link";
import Image from "next/image";

const memberIds = Array.from({ length: 22 }, (_, i) => i + 1);

export default function MembersPage() {
  return (
    <div className="members-content">
      <Link href="/" className="back-link">
        ← 홈으로
      </Link>
      <div className="members-grid">
        {memberIds.map((id) => (
          <Link key={id} href={`/members/${id}`} className="member-btn">
            <Image
              src={`/images/members/${id}.png`}
              alt={`길드원 ${id}`}
              width={400}
              height={400}
              className="member-img"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
