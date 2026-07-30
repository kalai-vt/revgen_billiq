import type { ThermalPaperSize } from '@/lib/printing/escpos';

/** Converts the tenant's logo into an ESC/POS raster bit-image command ("GS v 0"), the only way
 * to get a picture onto a thermal printout — raw ESC/POS has no concept of an embedded image the
 * way a PDF does, so the logo has to be rasterized to a 1-bit monochrome bitmap and sent as raw
 * dot data. Runs entirely client-side (Canvas), so it needs the image host to allow cross-origin
 * pixel reads (Vercel Blob's public access tier does, by default). Fails soft to `null` on any
 * error — a missing/blocked logo should never break the rest of the receipt. */

const GS = '\x1D';

// Typical native raster width for commodity 203dpi thermal printers, matching each paper size's
// printable area — not the same as escpos.ts's CHARS_PER_LINE, which counts text columns, not
// image dots.
const LOGO_WIDTH_DOTS: Record<ThermalPaperSize, number> = {
  '58mm': 384,
  '80mm': 576,
};

const MAX_LOGO_HEIGHT_DOTS = 200;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load logo image: ${url}`));
    img.src = url;
  });
}

/** Floyd–Steinberg error-diffusion dithering to 1-bit — holds up far better than a flat
 * black/white threshold for photographic or gradient logos on a 1-bit thermal printer. */
function toMonochrome(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const alpha = rgba[i * 4 + 3] / 255;
    // Composite onto a white background for transparent pixels before taking luminance.
    luminance[i] = (r * 0.299 + g * 0.587 + b * 0.114) * alpha + 255 * (1 - alpha);
  }

  const bitmap = new Uint8Array(width * height); // 1 = print (black), 0 = leave white
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value = luminance[i];
      const black = value < 128;
      bitmap[i] = black ? 1 : 0;
      const error = black ? value : value - 255;
      const spread = (xx: number, yy: number, factor: number) => {
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) return;
        luminance[yy * width + xx] += error * factor;
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }
  return bitmap;
}

function rasterCommand(bitmap: Uint8Array, width: number, height: number): string {
  const bytesPerRow = Math.ceil(width / 8);
  const header = [
    GS,
    'v',
    '0',
    '\x00', // m: normal (1x1 dot) mode
    String.fromCharCode(bytesPerRow & 0xff),
    String.fromCharCode((bytesPerRow >> 8) & 0xff),
    String.fromCharCode(height & 0xff),
    String.fromCharCode((height >> 8) & 0xff),
  ].join('');

  let data = '';
  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < bytesPerRow; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x < width && bitmap[y * width + x]) byte |= 0x80 >> bit;
      }
      data += String.fromCharCode(byte);
    }
  }

  return header + data;
}

export async function buildLogoCommand(logoUrl: string, paperSize: ThermalPaperSize): Promise<string | null> {
  try {
    const image = await loadImage(logoUrl);
    const widthDots = LOGO_WIDTH_DOTS[paperSize];
    const scale = widthDots / image.naturalWidth;
    const heightDots = Math.min(MAX_LOGO_HEIGHT_DOTS, Math.max(1, Math.round(image.naturalHeight * scale)));

    const canvas = document.createElement('canvas');
    canvas.width = widthDots;
    canvas.height = heightDots;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, widthDots, heightDots);
    ctx.drawImage(image, 0, 0, widthDots, heightDots);

    const { data } = ctx.getImageData(0, 0, widthDots, heightDots);
    const bitmap = toMonochrome(data, widthDots, heightDots);
    return rasterCommand(bitmap, widthDots, heightDots);
  } catch (err) {
    console.warn('Could not render logo for thermal printing:', err);
    return null;
  }
}
