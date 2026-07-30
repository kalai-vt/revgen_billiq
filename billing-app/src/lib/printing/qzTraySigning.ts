import { request } from '@/lib/api-client';

/** Fetches the app's public QZ Tray signing certificate and asks the backend to sign each
 * connection/print request, giving QZ Tray a stable identity to trust — see qzTray.ts for why
 * that's what actually stops the "Action Required" dialog from reappearing on every print.
 * Both calls resolve to an empty string on failure (including "not configured on this
 * deployment") rather than throwing, so printing degrades to today's unsigned/anonymous mode
 * instead of breaking outright. */

let cachedCertificate: Promise<string> | null = null;

export function getCertificate(): Promise<string> {
  if (!cachedCertificate) {
    cachedCertificate = request<{ certificate: string }>('/api/printing/qz-certificate')
      .then((data) => data.certificate)
      .catch(() => '');
  }
  return cachedCertificate;
}

export async function sign(toSign: string): Promise<string> {
  try {
    const data = await request<{ signature: string }>('/api/printing/qz-sign', {
      method: 'POST',
      body: JSON.stringify({ to_sign: toSign }),
    });
    return data.signature;
  } catch {
    return '';
  }
}
