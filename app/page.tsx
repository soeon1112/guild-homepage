import Link from "next/link";
import Image from "next/image";
import Guestbook from "./components/Guestbook";
import LoginBar from "./components/LoginBar";
import ActivityFeed from "./components/ActivityFeed";

const menuItems: { href: string; icon: string; label: string }[] = [
  { href: "/rules", icon: "/images/guild-rules.png", label: "길드 규칙" },
  { href: "/schedule", icon: "/images/schedule.png", label: "일정" },
  { href: "/members", icon: "/images/members.png", label: "길드원" },
  { href: "/stats", icon: "/images/combat-status.png", label: "투력 및 지옥 현황" },
  { href: "/album", icon: "/images/album.png", label: "앨범" },
  { href: "/board", icon: "/images/guild-memories.png", label: "길드 추억" },
];


export default function Home() {
  return (
    <>
      <div className="main-content">
        {/* Hero: logo + subtitle */}
        <section className="hero">
          <img
            src="/images/guild-logo.png"
            alt="새벽빛"
            width={280}
            height={280}
            className="hero-logo"
          />
        </section>

        {/* Login */}
        <LoginBar />

        {/* Activity Feed */}
        <ActivityFeed />

        {/* YouTube */}
        <section className="youtube-section">
          <div className="youtube-wrapper">
            <iframe
              src="https://www.youtube.com/embed/-ZdAFoqcnPA"
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>

        {/* Guestbook */}
        <Guestbook />

        {/* Menu grid */}
        <div className="menu-grid">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className="menu-item">
              <Image
                src={item.icon}
                alt={item.label}
                width={140}
                height={140}
                className="menu-icon"
              />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
