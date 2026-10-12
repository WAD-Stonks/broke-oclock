// Tint and icon for each deal category, used by the map pins, list rows and detail view.
// Icons are Lucide outlines (24x24, stroked) kept as path data so both Vue templates and the
// DOM-built Leaflet pins can draw them without parsing HTML.
export type CategoryIcon = 'coffee' | 'soup' | 'ice-cream' | 'cookie' | 'cake' | 'tag'

export type CategoryStyle = {
  readonly tint: string
  readonly icon: CategoryIcon
}

export const CATEGORY_ICON_PATHS: Record<CategoryIcon, readonly string[]> = {
  coffee: [
    'M10 2v2',
    'M14 2v2',
    'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
    'M6 2v2',
  ],
  soup: [
    'M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z',
    'M7 21h10',
    'M19.5 12 22 6',
    'M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62',
    'M11.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62',
    'M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62',
  ],
  'ice-cream': [
    'm7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11',
    'M17 7A5 5 0 0 0 7 7',
    'M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4',
  ],
  cookie: [
    'M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5',
    'M8.5 8.5v.01',
    'M16 15.5v.01',
    'M12 12v.01',
    'M11 17v.01',
    'M7 14v.01',
  ],
  cake: [
    'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8',
    'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1',
    'M2 21h20',
    'M7 8v3',
    'M12 8v3',
    'M17 8v3',
    'M7 4h.01',
    'M12 4h.01',
    'M17 4h.01',
  ],
  tag: [
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    'M7.5 7.5h.01',
  ],
}

// Category codes as stored on deals (upper case). Tints are CSS custom properties from main.css.
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  DRINKS: { tint: 'var(--tint-drinks)', icon: 'coffee' },
  FOOD: { tint: 'var(--tint-food)', icon: 'soup' },
  DESSERT: { tint: 'var(--tint-dessert)', icon: 'ice-cream' },
  SNACKS: { tint: 'var(--tint-snacks)', icon: 'cookie' },
  BAKERY: { tint: 'var(--tint-bakery)', icon: 'cake' },
}

export const FALLBACK_CATEGORY_STYLE: CategoryStyle = { tint: 'var(--tint-other)', icon: 'tag' }

export const categoryStyle = (category: string): CategoryStyle =>
  CATEGORY_STYLES[category.toUpperCase()] ?? FALLBACK_CATEGORY_STYLE

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

// Builds the icon with DOM calls (never innerHTML) for Leaflet's divIcon.
export const createCategoryIconElement = (icon: CategoryIcon): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of CATEGORY_ICON_PATHS[icon]) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
