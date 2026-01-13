'use client';

import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { projects } from '@/data/projects';
import { ExternalLink, Play } from 'lucide-react';

export default function FilmPage() {
  const filmProjects = projects.filter((p) => p.medium === 'film');

  return (
    <PageLayout title="Film">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 pt-8 text-center">
          <h2 className="text-2xl md:text-3xl text-stone-200 mb-4">Film</h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            Moving images that explore loops, memory, and the weight of objects.
          </p>
        </div>

        {/* Film list */}
        <div className="space-y-16 pb-24">
          {filmProjects.map((film, index) => (
            <motion.article
              key={film.id}
              className="group"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2, duration: 0.6 }}
            >
              {/* Video placeholder */}
              <div className="aspect-[21/9] bg-stone-900 border border-stone-800 mb-6 relative overflow-hidden group-hover:border-stone-700 transition-colors">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-stone-700 flex items-center justify-center group-hover:border-stone-500 transition-colors">
                    <Play className="w-6 h-6 text-stone-600 group-hover:text-stone-400 transition-colors ml-1" />
                  </div>
                </div>
                {/* Overlay text */}
                <div className="absolute bottom-4 left-4 text-[10px] tracking-[0.3em] uppercase text-stone-700">
                  [preview unavailable]
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div>
                  <h3 className="text-xl text-stone-200 mb-2">{film.title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed max-w-md">
                    {film.description}
                  </p>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                  <span className="text-xs text-stone-600 tabular-nums">
                    {film.year}
                  </span>
                  {film.links.map((link) => (
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
              </div>
            </motion.article>
          ))}

          {filmProjects.length === 0 && (
            <p className="text-stone-600 text-center py-12">
              Film projects coming soon.
            </p>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
