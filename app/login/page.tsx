"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { AuthModal } from "@/app/components/redesign/TopHeader";

function LoginContent() {
  const { nickname, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnUrl");
  const dest =
    raw && raw !== "/login" && raw.startsWith("/") ? raw : "/";
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (nickname) {
      router.replace(dest);
    } else if (dismissed) {
      router.replace("/");
    }
  }, [ready, nickname, dismissed, dest, router]);

  if (!ready || nickname || dismissed) return null;

  return (
    <AuthModal initialMode="login" onClose={() => setDismissed(true)} />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
