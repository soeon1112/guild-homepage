// Main page — redesign (Step: global chrome moved to ChromeShell; page keeps only sections)
import { TodaySky } from "./components/redesign/TodaySky";
import { ShootingStarLetter } from "./components/redesign/ShootingStarLetter";
import { NebulaWhispers } from "./components/redesign/NebulaWhispers";
import { WhispersToStars } from "./components/redesign/WhispersToStars";
import { StarOfDay } from "./components/redesign/StarOfDay";

export default function Home() {
  return (
    <div className="main-content">
      {/* Today's Sky — constellation + attendance check-in */}
      <TodaySky />

      {/* Shooting-star letter — compose & inbox */}
      <ShootingStarLetter />

      {/* Nebula whispers — recent activity feed */}
      <NebulaWhispers />

      {/* Whispers to stars — home guestbook (floating cards) */}
      <WhispersToStars />

      {/* Star of the day — random member spotlight */}
      <StarOfDay />
    </div>
  );
}
