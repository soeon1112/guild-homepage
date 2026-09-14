"use client";

type MobileTabsProps = {
  active: "participants" | "chat";
  onChange: (tab: "participants" | "chat") => void;
  participantCount: number;
};

// 모바일/앱 전용 탭 전환(D절 옵션 A 채택 — 좁은 화면에서 참가자+채팅
// 세로 분할은 둘 다 너무 작아져 비실용적이라 판단). md:hidden이라
// 데스크탑에선 렌더되지 않고, 데스크탑은 항상 양쪽 패널을 동시에 보여줌.
export function MobileTabs({ active, onChange, participantCount }: MobileTabsProps) {
  const tabs: { id: "participants" | "chat"; label: string }[] = [
    { id: "participants", label: participantCount > 0 ? `참가자 ${participantCount}` : "참가자" },
    { id: "chat", label: "채팅" },
  ];

  return (
    <div
      className="flex shrink-0 md:hidden"
      style={{ borderBottom: "1px solid rgba(254, 245, 230, 0.14)" }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex-1 py-2.5 text-center text-[13px] font-semibold transition-colors"
            style={{
              color: isActive ? "#ffc785" : "rgba(254, 245, 230, 0.55)",
              borderBottom: isActive ? "2px solid #ffc785" : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
