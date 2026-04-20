"use client";

import { useRouter, usePathname } from "next/navigation";

export default function BackLink({
  href,
  back,
  className,
  style,
  children,
}: {
  href?: string;
  back?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
    document.body.style.opacity = "0";

    if (back) {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        sessionStorage.setItem("scroll:restore", "/");
        router.push("/");
      }
      return;
    }

    if (href) {
      sessionStorage.setItem("scroll:restore", href);
      router.push(href);
    }
  };

  return (
    <a href={href ?? "#"} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
