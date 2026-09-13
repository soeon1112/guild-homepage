"use client";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="6.5" stroke="#ffc785" strokeWidth="1.6" />
      <path d="M15 15 L20.5 20.5" stroke="#ffc785" strokeWidth="1.6" strokeLinecap="round" />
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
    <div className="relative mb-4">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="닉네임 검색..."
        aria-label="닉네임 검색"
        className="w-full rounded-full bg-white/50 py-2.5 pl-10 pr-4 text-sm focus:outline-none"
        style={{ border: "1.5px solid #ffc785", color: "#8a6a4a" }}
      />
    </div>
  );
}
