"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useScroll, useSpring } from "motion/react";
import { Logo } from "./ui";
import { useTour } from "./tour/Tour";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", n: "01", label: "Overview" },
  { href: "/live", n: "02", label: "Live & replay" },
  { href: "/cover", n: "03", label: "Get covered" },
  { href: "/simulate", n: "04", label: "Scenario lab" },
  { href: "/studio", n: "05", label: "Actuary studio" },
];

function Clock() {
  const [t, setT] = useState<string>("");
  useEffect(() => {
    const f = () =>
      setT(new Date().toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    f();
    const i = setInterval(f, 1000);
    return () => clearInterval(i);
  }, []);
  return <span className="mono tabular-nums">{t || "--:--:--"}</span>;
}

export function Nav() {
  const path = usePathname();
  const tour = useTour();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--rule-2)] bg-[var(--paper)]/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="sign text-[22px] leading-none tracking-tight">Daycover+</span>
          <span className="caps hidden text-ink-3 sm:inline">by Income</span>
        </Link>
        <nav className="hidden h-full items-stretch md:flex" data-tour="nav">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className="group relative flex items-center gap-2 px-4 text-[13px]">
                <span className={`mono text-[10px] ${active ? "text-plate" : "text-ink-3"}`}>{l.n}</span>
                <span className={active ? "font-semibold text-ink" : "text-ink-2 group-hover:text-ink"}>{l.label}</span>
                {active && <motion.span layoutId="nav-bar" className="absolute inset-x-3 bottom-0 h-[3px] bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="caps hidden items-center gap-2 text-ink-2 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-plate blink" /> SGT <Clock />
          </span>
          <button
            onClick={() => tour.start()}
            className="flex items-center gap-2 border border-ink bg-marigold px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
            Take the 2-min tour
          </button>
        </div>
      </div>
      <motion.div className="absolute bottom-[-2px] left-0 right-0 h-[3px] origin-left bg-marigold" style={{ scaleX: progress }} />
      <div className="flex justify-around border-t border-[var(--rule)] md:hidden">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`flex-1 py-2 text-center text-[11px] ${active ? "bg-ink text-paper" : "text-ink-2"}`}>
              {l.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
