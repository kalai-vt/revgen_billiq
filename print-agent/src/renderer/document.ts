/** Turns a wire `PrintDocument` into ESC/POS command fragments.
 *
 * This exists so the "which renderer for which document type" decision lives in exactly one
 * place. Every thermal adapter (USB, network, Bluetooth serial, OS raw queue) had its own copy of
 * that branch, which meant adding a document type meant editing four files and silently supporting
 * it on three of them if you missed one.
 */

import {
  buildKotCommands,
  buildReceiptCommands,
  buildTestPrintCommands,
  type KotTicketData,
  type ReceiptBusinessInfo,
  type ReceiptData,
  type ThermalPaperSize,
} from './escpos.js';
import type { PrintDocument } from '../types.js';

export class UnsupportedDocumentError extends Error {}

/** @throws UnsupportedDocumentError when the document carries no payload the thermal path can
 * render — callers surface this as the job's failure reason rather than printing a blank ticket. */
export function buildDocumentCommands(document: PrintDocument, paperSize: ThermalPaperSize): string[] {
  if (document.type === 'test_print') {
    return buildTestPrintCommands(paperSize);
  }

  if (document.type === 'kot') {
    if (!document.kot) {
      throw new UnsupportedDocumentError('A kitchen ticket was sent with no kot payload.');
    }
    return buildKotCommands(document.kot as KotTicketData, paperSize);
  }

  if (!document.receipt) {
    throw new UnsupportedDocumentError(`A ${document.type} document was sent with no receipt payload.`);
  }
  const { business, data } = document.receipt as { business: ReceiptBusinessInfo; data: ReceiptData };
  return buildReceiptCommands(business, data, paperSize);
}
