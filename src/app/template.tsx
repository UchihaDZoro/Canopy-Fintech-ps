"use client";
import { motion } from "motion/react";

// Every route enters the same way: a short fade (opacity only: a transform here would break position:fixed drawers inside pages).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
