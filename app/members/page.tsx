import Link from "next/link";
import Image from "next/image";
import BackLink from "@/app/components/BackLink";

const memberIds: (number | string)[] = [
  "a", 1, "1-2",
  ...Array.from({ length: 20 }, (_, i) => i + 2).filter((id) => id !== 10 && id !== 11),
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
