/** A hand-built, minimal valid single-page PDF for the OS-print adapter's test-print action
 * (spec §15's "Test Print" button, OS-printer path — A4/A5/letter documents normally arrive as an
 * already-rendered PDF from the backend's `invoice_designer/pdf_renderer.py`, but a test print has
 * no invoice to render, so the agent needs to produce *something* printable on its own). No PDF
 * library dependency — PDF's base text-object syntax is simple enough to write directly, and this
 * is the only place in the agent that ever needs to produce a PDF from scratch. */

export function buildTestPrintPdf(paperWidth: string): string {
  const text = [`RevGenAI Print Agent`, `Printer Test`, paperWidth, new Date().toLocaleString(), `Printer connection successful`];
  const lines = text.map((line, i) => `1 0 0 1 72 ${700 - i * 24} Tm (${escapePdfText(line)}) Tj`).join('\nET\nBT\n');

  const content = `BT /F1 16 Tf\n${lines}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildTestPrintPdfBase64(paperWidth: string): string {
  return Buffer.from(buildTestPrintPdf(paperWidth), 'latin1').toString('base64');
}
