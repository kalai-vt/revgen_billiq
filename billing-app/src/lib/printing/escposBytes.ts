/** Converts `escpos.ts`'s command/text fragments (plain strings where each char code is already
 * the intended raw byte — see `buildReceiptCommands`) into a single `Uint8Array`. QZ Tray accepts
 * the string array directly and does this conversion internally; Web Bluetooth/Web USB need real
 * bytes, so callers outside QZ Tray go through this first. */
export function toBytes(commands: string[]): Uint8Array<ArrayBuffer> {
  const joined = commands.join('');
  const bytes = new Uint8Array(joined.length);
  for (let i = 0; i < joined.length; i++) {
    bytes[i] = joined.charCodeAt(i) & 0xff;
  }
  return bytes;
}
