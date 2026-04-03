import Link from "next/link";
import Image from "next/image";

const memberIds: (number | string)[] = [
  1, "1-2",
  ...Array.from({ length: 20 }, (_, i) => i + 2).filter((id) => id !== 5),
];

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
