// ============================================
// CUSTOMIZATION POINT: Project Data
// Add/edit projects here. Each project has:
// - id: unique identifier
// - title: project name
// - year: creation year
// - tags: array of tags for filtering
// - medium: 'web' | 'film' | 'writing' | 'engine'
// - description: short description
// - links: array of { label, url } (max 3)
// - media: placeholder image path
// ============================================

export interface Project {
  id: string;
  title: string;
  year: number;
  tags: string[];
  medium: 'web' | 'film' | 'writing' | 'engine';
  description: string;
  links: { label: string; url: string }[];
  media?: string;
}

export const projects: Project[] = [
  {
    id: 'pathology-engine',
    title: 'Pathology Engine',
    year: 2024,
    tags: ['interactive', 'narrative', 'loop'],
    medium: 'engine',
    description: 'A recursive narrative engine that remembers choices across sessions. The structure itself is the message.',
    links: [
      { label: 'Live Demo', url: '#' },
      { label: 'Source', url: '#' },
    ],
  },
  {
    id: 'echo-interface',
    title: 'Echo Interface',
    year: 2024,
    tags: ['web', 'experimental', 'audio'],
    medium: 'web',
    description: 'Web experience where past interactions leave acoustic traces in the present.',
    links: [
      { label: 'Experience', url: '#' },
    ],
  },
  {
    id: 'strata-visualization',
    title: 'Strata',
    year: 2023,
    tags: ['data', 'generative', 'archive'],
    medium: 'web',
    description: 'Layered visualization of accumulated decisions. Each stratum is a compressed history.',
    links: [
      { label: 'View', url: '#' },
      { label: 'Documentation', url: '#' },
    ],
  },
  {
    id: 'return-short',
    title: 'Return',
    year: 2023,
    tags: ['short', 'loop', 'memory'],
    medium: 'film',
    description: 'A 12-minute loop. The ending is the beginning is the ending.',
    links: [
      { label: 'Watch', url: '#' },
    ],
  },
  {
    id: 'wheelchair-doc',
    title: 'The Wheelchair',
    year: 2022,
    tags: ['documentary', 'family', 'object'],
    medium: 'film',
    description: 'Documentary about an inherited object and the weight it carries.',
    links: [
      { label: 'Trailer', url: '#' },
      { label: 'Press Kit', url: '#' },
    ],
  },
  {
    id: 'scar-tissue-novel',
    title: 'Scar Tissue',
    year: 2024,
    tags: ['novel', 'autofiction', 'structure'],
    medium: 'writing',
    description: 'A novel written in loops. Each chapter returns to the same moment from a different angle.',
    links: [
      { label: 'Excerpt', url: '#' },
    ],
  },
  {
    id: 'pathology-essays',
    title: 'Notes on Pathology',
    year: 2023,
    tags: ['essay', 'theory', 'fragment'],
    medium: 'writing',
    description: 'Collected fragments on why we return to what hurts us.',
    links: [
      { label: 'Read', url: '#' },
    ],
  },
];

export const mediumLabels: Record<string, string> = {
  web: 'Interactive',
  engine: 'Engine',
  film: 'Film',
  writing: 'Writing',
};

export const allTags = Array.from(
  new Set(projects.flatMap((p) => p.tags))
).sort();
