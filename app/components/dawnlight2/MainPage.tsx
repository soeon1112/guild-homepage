"use client";

// Placeholder for the 하늘섬 (Dawnlight 2) main page — gated to nicknames
// listed in src/lib/featureFlags.ts (currently "언쏘" only). The actual
// design lands in follow-up commits; this file just confirms the gate
// works and reserves the import path so app/page.tsx can branch.
export function Dawnlight2MainPage() {
  return (
    <div className="main-content">
      <section
        style={{
          padding: "3rem 1.25rem",
          textAlign: "center",
          color: "var(--abyss-foreground, #e7e3ff)",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
          하늘섬 (Dawnlight 2)
        </h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          새 디자인 준비 중이에요.
          <br />
          이 화면은 언쏘 닉네임에게만 보이는 placeholder예요.
        </p>
      </section>
    </div>
  );
}
