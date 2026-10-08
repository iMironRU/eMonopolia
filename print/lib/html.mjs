import QRCode from 'qrcode';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function qrSvg(url, { dark = '#0d1b2a' } = {}) {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff00' } });
  // Делаем SVG масштабируемым: убираем фиксированные размеры
  return svg.replace(/width="\d+"\s+height="\d+"/, 'width="100%" height="100%"');
}

export const NAVY = '#0d1b2a';
export const BRAND = '#00b86b';

/** Общие стили для всех печатных документов. */
export const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Inter', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif; color: ${NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; overflow: hidden; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .logo { font-weight: 900; letter-spacing: -0.02em; }
  .logo b { color: ${BRAND}; font-weight: 900; }
  .muted { color: #6c757d; }
`;

export function document(title, css, body) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

/** Логотип-иконка как inline SVG (из branding/logo-icon.svg, упрощённо). */
export function logoIcon(size = '10mm') {
  return `<svg viewBox="0 0 180 180" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="180" height="180" rx="36" fill="${NAVY}"/>
    <text x="90" y="128" text-anchor="middle" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-weight="900" font-size="120" fill="${BRAND}">e</text>
  </svg>`;
}
