import { request } from '@/lib/api-client';

/** Additional print destinations. The billing printer is deliberately not one of these — it keeps
 * its existing `auto_print_*` settings, which already work. */
export type PrinterRole = 'kot' | 'bar' | 'tandoor' | 'label';

export type ConnectionType = 'usb' | 'lan' | 'wifi' | 'bluetooth';

/** `connected` is only ever set by an actual successful test, never by saving the form. */
export type ConnectionStatus = 'unconfigured' | 'untested' | 'connected' | 'failed';

export interface TicketFields {
  restaurant_name: boolean;
  table_number: boolean;
  kot_number: boolean;
  date_time: boolean;
  customer_name: boolean;
  order_notes: boolean;
}

export interface PrinterConfiguration {
  id: string;
  role: PrinterRole;
  enabled: boolean;
  printer_name: string | null;
  connection_type: ConnectionType;
  ip_address: string | null;
  port: number | null;
  usb_device_id: string | null;
  bluetooth_device_id: string | null;
  paper_width: string;
  copies: number;
  auto_print: boolean;
  ticket_fields: TicketFields;
  connection_status: ConnectionStatus;
  last_tested_at: string | null;
  last_test_error: string | null;
}

export type PrinterConfigurationUpdate = Partial<
  Pick<
    PrinterConfiguration,
    | 'enabled'
    | 'printer_name'
    | 'connection_type'
    | 'ip_address'
    | 'port'
    | 'usb_device_id'
    | 'bluetooth_device_id'
    | 'paper_width'
    | 'copies'
    | 'auto_print'
    | 'ticket_fields'
  >
>;

export function getPrinterConfig(role: PrinterRole = 'kot'): Promise<PrinterConfiguration> {
  return request(`/api/printing/config/${role}`);
}

export function updatePrinterConfig(
  role: PrinterRole,
  payload: PrinterConfigurationUpdate,
): Promise<PrinterConfiguration> {
  return request(`/api/printing/config/${role}`, { method: 'PUT', body: JSON.stringify(payload) });
}

/** Records a test the browser actually performed. The server cannot run this itself — the USB or
 * Bluetooth connection lives in the browser — which is exactly why status is reported rather than
 * assumed. */
export function recordConnectionTest(
  role: PrinterRole,
  result: { ok: boolean; error?: string | null },
): Promise<PrinterConfiguration> {
  return request(`/api/printing/config/${role}/test-result`, {
    method: 'POST',
    body: JSON.stringify(result),
  });
}
