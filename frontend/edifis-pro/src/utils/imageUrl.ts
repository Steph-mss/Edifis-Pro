const API_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  '/api';

export const BACKEND_URL = API_URL.replace(/\/api\/?$/, '');

function normalizeFileName(value?: string | null): string {
  if (!value) return '';
  return value.replace(/^\/+/, '');
}

export function getConstructionImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) {
    return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSANsddCLc_2TYdgSqBQVFNutn0FvR6qB7BQg&s';
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/uploads/')) {
    return imageUrl;
  }

  return `/uploads/construction_sites/${normalizeFileName(imageUrl)}`;
}

export function getProfileImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return '';

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/uploads/')) {
    return imageUrl;
  }

  return `/uploads/profile_pictures/${normalizeFileName(imageUrl)}`;
}