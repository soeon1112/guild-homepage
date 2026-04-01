import Link from "next/link";
import Image from "next/image";
import Guestbook from "./components/Guestbook";

const menuItems = [
  { href: "/rules", icon: "/images/guild-rules.png", label: "길드 규칙" },
  { href: "/schedule", icon: "/images/schedule.png", label: "일정" },
  { href: "/members", icon: "/images/members.png", label: "길드원 소개" },
  { href: "/stats", icon: "/images/combat-status.png", label: "투력 및 지옥 현황" },
  { href: "https://www.notion.so/2d2b27f7dd7380858345e27689964564", icon: "/images/album.png", label: "앨범", external: true },
  { href: "/album", icon: "/images/guild-memories.png", label: "길드 추억" },
];


export default function Home() {
  return (
    <>
      <div className="main-content">
        {/* Hero: logo + subtitle */}
        <section className="hero">
          <img
            src="/images/logo.png"
            alt="새벽빛"
            width={280}
            height={280}
            className="hero-logo"
          />
        </section>

        {/* Guestbook */}
        <Guestbook />

        {/* Menu grid */}
        <div className="menu-grid">
          {menuItems.map((item) =>
            item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="menu-item">
                <Image
                  src={item.icon}
                  alt={item.label}
                  width={140}
                  height={140}
                  className="menu-icon"
                />
              </a>
            ) : (
              <Link key={item.href} href={item.href} className="menu-item">
                <Image
                  src={item.icon}
                  alt={item.label}
                  width={140}
                  height={140}
                  className="menu-icon"
                />
              </Link>
            )
          )}
        </div>
      </div>
    </>
  );
}
