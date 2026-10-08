// Нарезка готового PDF поля (A2) на 4 листа A4 для домашней печати.
// Chromium при печати уменьшает страницу, если внутри есть элемент шире листа,
// поэтому кроп делаем на уровне PDF, а не CSS.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MM = 72 / 25.4;

/**
 * @param a2Bytes байты board-a2.pdf
 * @param opts { boardMm, offsetMm } — размер доски и её отступ от левого верхнего угла страницы A2
 */
export async function tileBoardToA4(a2Bytes, { boardMm = 400, offsetMm = 10, a2HeightMm = 594 } = {}) {
  const src = await PDFDocument.load(a2Bytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const half = boardMm / 2;
  const tiles = [
    [0, 0, 'top-left'],
    [1, 0, 'top-right'],
    [0, 1, 'bottom-left'],
    [1, 1, 'bottom-right'],
  ];
  const srcPage = src.getPages()[0];
  for (const [x, y, label] of tiles) {
    const left = (offsetMm + x * half) * MM;
    const right = (offsetMm + (x + 1) * half) * MM;
    const top = (a2HeightMm - offsetMm - y * half) * MM;
    const bottom = (a2HeightMm - offsetMm - (y + 1) * half) * MM;
    const embedded = await out.embedPage(srcPage, { left, bottom, right, top });
    const page = out.addPage([210 * MM, 297 * MM]);
    const px = 5 * MM;
    const py = (297 - 5 - half) * MM;
    page.drawPage(embedded, { x: px, y: py, width: half * MM, height: half * MM });
    // Рамка реза
    page.drawRectangle({ x: px, y: py, width: half * MM, height: half * MM, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.3 });
    page.drawText(`eMonopolia board ${boardMm}x${boardMm} mm - sheet ${tiles.findIndex((t) => t[2] === label) + 1}/4 (${label}). Cut along the frame, glue edge to edge.`, {
      x: px,
      y: py - 6 * MM,
      size: 9,
      font,
      color: rgb(0.42, 0.46, 0.49),
    });
  }
  return out.save();
}
