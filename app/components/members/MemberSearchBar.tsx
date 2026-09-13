"use client";

// Phase 2.7 — 검색창 스타일을 기존 길드원 페이지(app/members/page.tsx
// dl2 분기의 StarSearchIcon + input 스타일)로 회귀. Phase 2의 신규
// 디자인(sunsetGold 굵은 테두리)을 걷어내고 그 페이지의 별+돋보기
// 아이콘 및 옅은 크림 톤 테두리/배경을 verbatim으로 가져왔다.
// value/onChange 계약(로직)은 그대로.

function StarSearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path
        d="M10 2 L11.2 7.8 L17 9 L11.2 10.2 L10 16 L8.8 10.2 L3 9 L8.8 7.8 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <circle cx="10" cy="9" r="5.5" />
      <path d="M14.5 13.5 L20 19" />
    </svg>
  );
}

export function MemberSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative mx-auto mb-8 max-w-sm">
      <span
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        style={{ color: "#fef5e6" }}
      >
        <StarSearchIcon />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="닉네임을 검색하세요"
        aria-label="닉네임 검색"
        className="w-full rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none"
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(254, 245, 230, 0.3)",
          color: "#fef5e6",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#fef5e6";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "rgba(254, 245, 230, 0.3)";
        }}
      />
    </div>
  );
}
