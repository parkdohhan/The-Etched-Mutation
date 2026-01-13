'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  backHref?: string;
  backLabel?: string;
}

export function PageLayout({
  children,
  title,
  backHref = '/',
  backLabel = 'Return to Map',
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-stone-950">
      {/* Background texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-stone-950/80 backdrop-blur-sm border-b border-stone-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-xs tracking-wider text-stone-500 hover:text-stone-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Link>

          <h1 className="text-xs tracking-[0.3em] uppercase text-stone-600">
            {title}
          </h1>
        </div>
      </header>

      {/* Content */}
      <motion.main
        className="pt-20 pb-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {children}
      </motion.main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-4 bg-stone-950/80 backdrop-blur-sm border-t border-stone-900">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center text-[10px] text-stone-600">
          <span>© 2024</span>
          <nav className="flex gap-6">
            <Link href="/works" className="hover:text-stone-400 transition-colors">
              Works
            </Link>
            <Link href="/film" className="hover:text-stone-400 transition-colors">
              Film
            </Link>
            <Link href="/writing" className="hover:text-stone-400 transition-colors">
              Writing
            </Link>
            <Link href="/about" className="hover:text-stone-400 transition-colors">
              About
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
