"use client";

import { useRouter, usePathname } from "next/navigation";

export default function BackLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY));
    sessionStorage.setItem("scroll:restore", href);
    document.body.style.opacity = "0";
    router.push(href);
  };

  return (
    <a href={href} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
