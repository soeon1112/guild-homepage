"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

const AUTH_WHITELIST = new Set(["/", "/login"]);

export function AuthGuard({ children }: { children: ReactNode }) {
  const { nickname, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const needsRedirect =
    ready && !nickname && !!pathname && !AUTH_WHITELIST.has(pathname);

  useEffect(() => {
    if (needsRedirect) {
      router.replace(`/login?returnUrl=${encodeURIComponent(pathname!)}`);
    }
  }, [needsRedirect, pathname, router]);

  if (needsRedirect) return null;

  return <>{children}</>;
}
