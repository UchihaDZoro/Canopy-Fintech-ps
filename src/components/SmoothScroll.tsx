"use client";
import { useEffect } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";

export function SmoothScroll() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Map-heavy pages need native wheel handling
    if (path.startsWith("/live")) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, prevent: (node) => !!node.closest("[data-lenis-prevent]") });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [path]);
  return null;
}
