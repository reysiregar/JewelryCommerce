export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  if (url.startsWith('data:image/')) {
    const parts = url.split(',');
    if (parts.length < 2) return false;
    
    const base64Part = parts[1];
    if (!base64Part || base64Part.length < 10) return false;
    
    return true;
  }
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  if (url.startsWith('/')) {
    return /^\/[a-zA-Z0-9\/_\-\.]+$/.test(url);
  }
  
  return false;
}

export function sanitizeImageUrl(url: string | null | undefined, fallback = '/favicon.png'): string {
  if (!isValidImageUrl(url)) {
    if (url && process.env.NODE_ENV === 'development') {
      console.warn('[Image Utils] Invalid image URL detected:', {
        url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
        reason: 'Failed validation',
        urlLength: url.length,
        startsWithData: url.startsWith('data:'),
        startsWithHttp: url.startsWith('http'),
        startsWithSlash: url.startsWith('/')
      });
    }
    return fallback;
  }
  return url!;
}

export function getBase64ImageSize(base64: string): number {
  if (!base64.startsWith('data:')) return 0;
  
  const base64Part = base64.split(',')[1];
  if (!base64Part) return 0;
  
  return (base64Part.length * 3) / 4;
}

export function isBase64ImageTooLarge(base64: string, maxSizeKB = 500): boolean {
  const sizeBytes = getBase64ImageSize(base64);
  return sizeBytes > maxSizeKB * 1024;
}
