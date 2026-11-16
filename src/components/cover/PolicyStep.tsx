"use client";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { BacktestResponse } from "@/lib/client/types";
import { LANGS, policyFull, policySms, smsSegments, teachBack, type Lang } from "@/lib/i18n/policy";
import { Card, Eyebrow, sgd } from "@/components/ui";

export function PolicyStep({ data, centre }: { data: BacktestResponse; centre: { id: string; name: string } }) {
  const [lang, setLang] = useState<Lang>("en");
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
  const [bought, setBought] = useState<{ no: string; at: string } | null>(null);
  const gauge = data.backtest.stations.rain[0] ?? { id: "—", name: "" };
  const ctx = { spec: data.product, weekly: data.quote.weeklyPremium, gauge: { id: gauge.id, name: gauge.name } };
  const sms = policySms(lang, ctx);
  const seg = smsSegments(sms);
  const quiz = useMemo(() => teachBack(lang, ctx), [lang, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const correct = answers.filter((a, i) => a === quiz[i].answer).length;
  const done = answers.every((a) => a !== null);
  const passed = done && correct === quiz.length;

  const buy = () => {
    const no = `CNP-${centre.id}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const at = new Date().toISOString();
    setBought({ no, at });
    try {
      localStorage.setItem("daycover.policy", JSON.stringify({ no, at, centre, weekly: data.quote.weeklyPremium, income: data.product.insuredDailyIncome }));
    } catch {
      /* storage may be unavailable */
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card className="p-6 md:p-8">
        <Eyebrow n="04">The whole policy, in one message</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setLang(l.id);
                setAnswers([null, null, null]);
              }}
              className={`rounded-full px-3 py-1.5 text-xs ${lang === l.id ? "bg-ink text-paper" : "border border-[var(--rule-2)] text-ink-2 hover:text-ink"}`}
            >
              {l.native}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-none bg-paper-2 p-4">
          <div className="mb-2 text-center text-[10px] uppercase tracking-widest text-ink-3">SMS · from INCOME</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={lang}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="max-w-[92%] rounded-none rounded-bl-md bg-card border border-[var(--rule-2)] px-4 py-3 text-[13.5px] leading-relaxed text-ink"
            >
              {sms}
            </motion.div>
          </AnimatePresence>
          <div className={`mt-2 text-right text-[10px] ${seg.segments === 1 ? "text-plate" : "text-heat"}`}>
            {seg.len} chars · {seg.unicode ? "Unicode (70/segment)" : "GSM-7 (160/segment)"} · {seg.segments === 1 ? "fits one SMS" : `${seg.segments} SMS segments`}
          </div>
        </div>
        <details className="group mt-4 rounded-none border border-[var(--rule)] bg-paper-2 p-4 text-[12.5px] leading-relaxed text-ink-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-ink/80">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> Full disclosure (sent with the policy schedule)
          </summary>
          <p className="mt-2">{policyFull(lang, ctx)}</p>
        </details>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
          Every number above is generated from your product terms and your gauge. Translations are drafts for Income&apos;s approved-wording
          review.
        </p>
      </Card>

      <Card className="p-6 md:p-8">
        <AnimatePresence mode="wait">
          {!bought ? (
            <motion.div key="quiz" exit={{ opacity: 0, y: -10 }}>
              <Eyebrow n="05">Teach-back · {correct}/{quiz.length} correct</Eyebrow>
              <div className="text-sm text-ink-2">Before you buy, show us you know when it pays — and when it doesn&apos;t.</div>
              <div className="mt-5 space-y-5">
                {quiz.map((q, qi) => (
                  <div key={qi}>
                    <div className="text-[14px] font-medium leading-snug">{q.q}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {q.options.map((o, oi) => {
                        const chosen = answers[qi] === oi;
                        const right = oi === q.answer;
                        const show = answers[qi] !== null;
                        return (
                          <motion.button
                            key={oi}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                            className={`rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                              show && chosen && right
                                ? "border-plate bg-plate-2 text-plate"
                                : show && chosen
                                  ? "border-alert bg-alert-2 text-alert"
                                  : "border-[var(--rule-2)] hover:bg-paper-2"
                            }`}
                          >
                            {o}
                          </motion.button>
                        );
                      })}
                    </div>
                    <AnimatePresence>
                      {answers[qi] !== null && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          className={`mt-2 overflow-hidden text-xs ${answers[qi] === q.answer ? "text-plate" : "text-alert"}`}
                        >
                          {answers[qi] === q.answer ? "✓ " : "Not quite — "}
                          {q.why}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
              <button
                disabled={!passed}
                onClick={buy}
                className="mt-7 w-full rounded-none bg-plate py-3.5 text-sm font-semibold text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                {passed ? `Start cover · ${sgd(data.quote.weeklyPremium, 2)}/week` : "Answer all three correctly to continue"}
              </button>
              <div className="mt-2 text-center text-[11px] text-ink-3">Cover starts after a 7-day waiting period, so it can&apos;t be bought only when a storm is forecast · 14-day free look</div>
            </motion.div>
          ) : (
            <motion.div key="card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 22 }}>
              <Eyebrow>You&apos;re covered</Eyebrow>
              <PolicyCard no={bought.no} centre={centre.name} gauge={`${gauge.id} · ${gauge.name}`} weekly={data.quote.weeklyPremium} income={data.product.insuredDailyIncome} />
              <div className="mt-5 flex gap-2">
                <Link href={`/live?centre=${centre.id}`} className="flex-1 rounded-none bg-plate py-3 text-center text-sm font-semibold text-paper">
                  Watch your gauge live →
                </Link>
                <button onClick={() => setBought(null)} className="rounded-none border border-[var(--rule-2)] px-4 text-sm text-ink-2">
                  Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

function PolicyCard({ no, centre, gauge, weekly, income }: { no: string; centre: string; gauge: string; weekly: number; income: number }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-14, 14]), { stiffness: 200, damping: 18 });
  const glare = useTransform(mx, [-0.5, 0.5], ["0%", "100%"]);
  return (
    <div style={{ perspective: 1000 }} className="mt-2">
      <motion.div
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width - 0.5);
          my.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onMouseLeave={() => {
          mx.set(0);
          my.set(0);
        }}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className="relative aspect-[1.6] overflow-hidden rounded-none border border-ink bg-[linear-gradient(135deg,#0b6e4f,#0a5a41_60%,#16150f)] p-6 shadow-[6px_6px_0_var(--ink)]"
      >
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: useTransform(glare, (g) => `radial-gradient(circle at ${g} 30%, rgba(255,255,255,0.45), transparent 45%)`) }}
        />
        <div className="relative flex h-full flex-col justify-between" style={{ transform: "translateZ(40px)" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/60">Daycover+ · Income Insurance</div>
              <div className="mt-1 sign-soft text-3xl text-white">Climate income cover</div>
            </div>
            <div className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Active</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px] text-white/70">
            <div>
              <div className="text-white/45">Stall</div>
              <div className="truncate text-white">{centre}</div>
            </div>
            <div>
              <div className="text-white/45">Settles on</div>
              <div className="truncate text-white">{gauge}</div>
            </div>
            <div>
              <div className="text-white/45">Insured daily income</div>
              <div className="text-white">{sgd(income)}</div>
            </div>
            <div>
              <div className="text-white/45">Premium</div>
              <div className="text-white">{sgd(weekly, 2)}/wk</div>
            </div>
          </div>
          <div className="font-mono text-sm tracking-[0.2em] text-white/80">{no}</div>
        </div>
      </motion.div>
    </div>
  );
}
