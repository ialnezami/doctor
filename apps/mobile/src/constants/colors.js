import useThemeStore from '../store/themeStore';

export const DARK = {
  bg: '#060d18', bg2: '#0b1624', bg3: '#101f34', card: '#0e1a2d',
  border: '#1a3050', border2: '#223d5e',
  mint: '#0fe3b0', mintDim: 'rgba(15,227,176,0.13)',
  amber: '#f59e0b', rose: '#f43f5e', blue: '#60a5fa',
  text: '#e8f4ff', text2: '#7ba8c4', text3: '#3d6480',
};

export const LIGHT = {
  bg: '#f8fafc', bg2: '#f1f5f9', bg3: '#e8eef4', card: '#ffffff',
  border: '#d0dce8', border2: '#a8bed0',
  mint: '#0ca87e', mintDim: 'rgba(12,168,126,0.12)',
  amber: '#d97706', rose: '#e11d48', blue: '#2563eb',
  text: '#0f1923', text2: '#4a6b82', text3: '#8aa5b8',
};

/**
 * useColors — returns the theme-appropriate color palette.
 * Use inside components instead of the static default import for theme-aware styling.
 */
export function useColors() {
  const theme = useThemeStore((s) => s.theme);
  return theme === 'light' ? LIGHT : DARK;
}

// Default export preserves backward compatibility with existing static imports.
export default DARK;
