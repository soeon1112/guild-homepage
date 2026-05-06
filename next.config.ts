import type { NextConfig } from "next";

// Build-time timestamp injected into the client bundle. Used by
// avatarUrl/partUrl as a `?v=` cache-bust suffix so re-uploaded PNGs are
// fetched fresh on the next deploy. Date.now() is evaluated when Vercel
// runs `next build`, so every deploy bakes in a new value.
const buildTimestamp = String(Date.now());

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_AVATAR_VERSION: buildTimestamp,
  },
  // Phase 2-B: /schedule 페이지가 /notice 통합 페이지의 일정 섹션으로
  // 합쳐졌다. 옛 외부 링크/북마크/푸시(이미 발사된 것)가 끊기지 않도록
  // 두 형태의 옛 URL 을 신규 통합 형태로 영구 리다이렉트한다.
  async redirects() {
    return [
      // /schedule (목록) → /notice 안 일정 섹션
      {
        source: "/schedule",
        destination: "/notice",
        permanent: true,
      },
      // /schedule/<id> → /notice?schedule=<id> (deep-link 자동 스크롤)
      {
        source: "/schedule/:id",
        destination: "/notice?schedule=:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
