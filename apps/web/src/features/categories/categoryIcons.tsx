import {
  Cpu,
  Factory,
  Flag,
  FolderOpen,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Lightbulb,
  Medal,
  Mountain,
  Palette,
  Plane,
  Scale,
  ScrollText,
  Shield,
  ShieldAlert,
  TrendingUp,
  Users,
  Wheat,
  Zap,
} from 'lucide-react';

export type CategoryIcon = typeof Wheat;

/** One icon per manifest category id; unknown ids fall back to a folder. */
const ICONS: Record<string, CategoryIcon> = {
  agriculture: Wheat,
  'crime-safety': ShieldAlert,
  culture: Palette,
  economics: TrendingUp,
  education: GraduationCap,
  environment: Leaf,
  'facts-trivia': Lightbulb,
  flags: Flag,
  geography: Mountain,
  health: HeartPulse,
  history: ScrollText,
  'infrastructure-energy': Zap,
  law: Scale,
  'manufacturing-mining': Factory,
  military: Shield,
  'politics-government': Landmark,
  population: Users,
  sports: Medal,
  'tech-business': Cpu,
  travel: Plane,
};

/** The icon for a category id, drawn at the given size class. */
export function CategoryGlyph({
  id,
  className = 'size-4',
}: {
  id: string;
  className?: string;
}) {
  const Icon = ICONS[id] ?? FolderOpen;
  return <Icon className={className} aria-hidden />;
}

/**
 * Tailwind classes giving each category a soft tinted tile. Spelled out in full so Tailwind's
 * scanner sees every class.
 */
const TINTS: Record<string, string> = {
  agriculture:
    'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  'crime-safety':
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  culture: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  economics:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  education:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  environment:
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'facts-trivia':
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  flags: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  geography:
    'bg-stone-200 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300',
  health: 'bg-red-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  history:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'infrastructure-energy':
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  law: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
  'manufacturing-mining':
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-200',
  military: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'politics-government':
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  population:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  sports: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'tech-business':
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  travel:
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
};

export function categoryTint(id: string): string {
  return TINTS[id] ?? 'bg-surface-2 text-muted';
}
