import Link from "next/link";
import Image from "next/image";
import BackLink from "@/app/components/BackLink";

const memberIds: (number | string)[] = [
  "a", 1, "1-2",
  2, 3, 4, 6, 7, 8, 9,
  12, 13, 14, "14-1", 15, 16, 17, "17-1", 18, 19, 20, 21, 22,
];

export default function MembersPage() {
  return (
    <div className="members-content">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
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
