'use client';

import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { Project, mediumLabels } from '@/data/projects';

interface ProjectCardProps {
  project: Project;
  index: number;
  onClick: () => void;
}

export function ProjectCard({ project, index, onClick }: ProjectCardProps) {
  return (
    <motion.article
      className="group cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      onClick={onClick}
    >
      <div className="border border-stone-800 hover:border-stone-700 transition-colors p-6 md:p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-[10px] tracking-[0.3em] uppercase text-stone-600">
              {mediumLabels[project.medium]}
            </span>
            <h3 className="text-lg md:text-xl text-stone-200 mt-1 group-hover:text-stone-100 transition-colors">
              {project.title}
            </h3>
          </div>
          <span className="text-xs text-stone-600 tabular-nums">
            {project.year}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-stone-500 leading-relaxed mb-4">
          {project.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] tracking-wider uppercase px-2 py-0.5 border border-stone-800 text-stone-600"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Links */}
        {project.links.length > 0 && (
          <div className="flex gap-4 pt-4 border-t border-stone-800/50">
            {project.links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
}
