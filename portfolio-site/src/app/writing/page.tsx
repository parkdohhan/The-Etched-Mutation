'use client';

import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { projects } from '@/data/projects';
import { ExternalLink, BookOpen } from 'lucide-react';

export default function WritingPage() {
  const writingProjects = projects.filter((p) => p.medium === 'writing');

  return (
    <PageLayout title="Writing">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 pt-8 text-center">
          <h2 className="text-2xl md:text-3xl text-stone-200 mb-4">Writing</h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            Fiction and essays that circle back on themselves.
          </p>
        </div>

        {/* Writing list */}
        <div className="space-y-8 pb-24">
          {writingProjects.map((work, index) => (
            <motion.article
              key={work.id}
              className="group border-l border-stone-800 pl-6 hover:border-stone-600 transition-colors"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15, duration: 0.5 }}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-stone-600" />
                  <h3 className="text-lg text-stone-200 group-hover:text-stone-100 transition-colors">
                    {work.title}
                  </h3>
                </div>
                <span className="text-xs text-stone-600 tabular-nums">
                  {work.year}
                </span>
              </div>

              <p className="text-stone-500 text-sm leading-relaxed mb-3 pl-7">
                {work.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-3 pl-7">
                {work.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] tracking-wider uppercase text-stone-600"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Links */}
              {work.links.length > 0 && (
                <div className="flex gap-4 pl-7">
                  {work.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
                    >
                      {link.label}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              )}
            </motion.article>
          ))}

          {writingProjects.length === 0 && (
            <p className="text-stone-600 text-center py-12">
              Writing projects coming soon.
            </p>
          )}
        </div>

        {/* Quote */}
        <div className="border-t border-stone-800 pt-12 pb-24">
          <blockquote className="text-center">
            <p className="text-stone-500 italic text-sm leading-relaxed max-w-md mx-auto">
              &ldquo;Pathology is not an event but a repeating structure of choice.&rdquo;
            </p>
          </blockquote>
        </div>
      </div>
    </PageLayout>
  );
}
