export const APPEARANCE_PRESETS = [
  { id: 'forest', name: 'Forest trail', description: 'A quiet trail through misty pines.', image: '/appearance/forest.webp' },
  { id: 'road', name: 'Open road', description: 'Clear skies and room to keep going.', image: '/appearance/road.webp' },
  { id: 'slate', name: 'Slate', description: 'A calm solid color, without an image.', image: null },
  { id: 'japanese', name: 'Japanese Minimal', description: 'Quiet ink landscapes on ivory paper.', image: '/appearance/japanese/background.webp' },
] as const;
export type AppearancePreset = typeof APPEARANCE_PRESETS[number]['id'];
export const DEFAULT_APPEARANCE: AppearancePreset = 'forest';
export function validAppearance(value: unknown): value is AppearancePreset {
  return APPEARANCE_PRESETS.some(preset => preset.id === value);
}
export function resolveAppearance(value: unknown): AppearancePreset {
  return validAppearance(value) ? value : DEFAULT_APPEARANCE;
}
export function validateAppearance(value: unknown): { preset: AppearancePreset; version: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose an appearance.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['preset', 'version'].includes(key)) || !validAppearance(input.preset)) throw new Error('Choose Forest trail, Open road, Slate or Japanese Minimal.');
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 0 || Number(input.version) >= Number.MAX_SAFE_INTEGER) throw new Error('Reload the latest profile before saving.');
  return { preset: input.preset, version: Number(input.version) };
}
