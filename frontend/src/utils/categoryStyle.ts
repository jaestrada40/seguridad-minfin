import { Globe, AppWindow, Layers, type LucideIcon } from 'lucide-react';
import { PortalCategory } from '../types';

interface CategoryStyle {
  icon: LucideIcon;
  badge: string;
  iconColor: string;
  panel: string;
}

const CATEGORY_STYLES: Record<PortalCategory, CategoryStyle> = {
  WordPress: {
    icon: Globe,
    badge: 'bg-blue-100/80 text-blue-700 border-blue-200/60',
    iconColor: 'text-blue-600',
    panel: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  Joomla: {
    icon: Layers,
    badge: 'bg-amber-100/80 text-amber-700 border-amber-200/60',
    iconColor: 'text-amber-600',
    panel: 'bg-amber-50 text-amber-600 border-amber-100',
  },
  Aplicación: {
    icon: AppWindow,
    badge: 'bg-purple-100/80 text-purple-700 border-purple-200/60',
    iconColor: 'text-purple-600',
    panel: 'bg-purple-50 text-purple-600 border-purple-100',
  },
};

export function getCategoryStyle(category: PortalCategory | string): CategoryStyle {
  return CATEGORY_STYLES[category as PortalCategory] ?? CATEGORY_STYLES['Aplicación'];
}
