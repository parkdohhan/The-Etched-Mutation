'use client';

import { motion } from 'framer-motion';
import { mediumLabels } from '@/data/projects';

interface FilterBarProps {
  activeMedium: string | null;
  activeTag: string | null;
  allTags: string[];
  onMediumChange: (medium: string | null) => void;
  onTagChange: (tag: string | null) => void;
}

export function FilterBar({
  activeMedium,
  activeTag,
  allTags,
  onMediumChange,
  onTagChange,
}: FilterBarProps) {
  const mediums = Object.entries(mediumLabels);

  return (
    <div className="space-y-4">
      {/* Medium filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onMediumChange(null)}
          className={`text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 border transition-colors ${
            activeMedium === null
              ? 'border-stone-500 text-stone-300'
              : 'border-stone-800 text-stone-600 hover:text-stone-400 hover:border-stone-700'
          }`}
        >
          All
        </button>
        {mediums.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onMediumChange(key)}
            className={`text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 border transition-colors ${
              activeMedium === key
                ? 'border-stone-500 text-stone-300'
                : 'border-stone-800 text-stone-600 hover:text-stone-400 hover:border-stone-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tag filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onTagChange(null)}
          className={`text-[9px] tracking-wider uppercase px-2 py-1 border transition-colors ${
            activeTag === null
              ? 'border-stone-600 text-stone-400'
              : 'border-stone-800/50 text-stone-600 hover:text-stone-500'
          }`}
        >
          all tags
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => onTagChange(tag)}
            className={`text-[9px] tracking-wider uppercase px-2 py-1 border transition-colors ${
              activeTag === tag
                ? 'border-stone-600 text-stone-400'
                : 'border-stone-800/50 text-stone-600 hover:text-stone-500'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
