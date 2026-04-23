/**
 * Returns the full URL for a construction site image.
 * Falls back to a placeholder if no image is stored.
 */
const API_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  '/api/api';

export const BACKEND_URL = API_URL.replace(/\/api$/, '');

export function getConstructionImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) {
    return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSANsddCLc_2TYdgSqBQVFNutn0FvR6qB7BQg&s';
  }
  // Already a full URL (e.g. https://...)
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${BACKEND_URL}/uploads/construction_sites/${imageUrl}`;
}

export function getProfileImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${BACKEND_URL}/uploads/profile_pictures/${imageUrl}`;
}
