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
};

export default nextConfig;
