import { request } from '@/lib/api-client';
import type { PlanId } from '@/features/auth/api';
import type { IdentifierType } from '@/features/products/api';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type PrimarySearchField = 'name' | 'identifier_value' | 'barcode' | 'category';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type DefaultPaymentMethod = 'cash' | 'card' | 'upi';
export type AutoPrintPaperSize = '58mm' | '80mm' | 'A5' | 'A4' | 'letter' | 'legal';

export interface Settings {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  gst_number: string | null;
  invoice_prefix: string;
  currency: string;
  theme: ThemeChoice;
  plan: PlanId;
  allow_manager_price_override: boolean;
  primary_search_field: PrimarySearchField;
  default_identifier_type: IdentifierType;
  enable_multiple_identifiers: boolean;
  require_unique_identifier: boolean;
  starting_invoice_number: number;
  receipt_footer: string | null;
  decimal_precision: number;
  date_format: DateFormat;
  default_tax_percent: number;
  allow_discounts: boolean;
  auto_print_after_checkout: boolean;
  auto_print_printer_name: string | null;
  auto_print_paper_size: AutoPrintPaperSize;
  enable_barcode: boolean;
  enable_customer_selection: boolean;
  allow_negative_stock: boolean;
  default_low_stock_threshold: number;
  default_payment_method: DefaultPaymentMethod;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  pan_number: string | null;
  fssai_number: string | null;
  drug_license_number: string | null;
  msme_udyam_number: string | null;
  social_links: Record<string, string> | null;
  feedback_url: string | null;
}

export interface SettingsUpdatePayload {
  logo_url?: string | null;
  gst_number?: string | null;
  invoice_prefix?: string;
  currency?: string;
  theme?: ThemeChoice;
  allow_manager_price_override?: boolean;
  primary_search_field?: PrimarySearchField;
  default_identifier_type?: IdentifierType;
  enable_multiple_identifiers?: boolean;
  require_unique_identifier?: boolean;
  starting_invoice_number?: number;
  receipt_footer?: string | null;
  decimal_precision?: number;
  date_format?: DateFormat;
  default_tax_percent?: number;
  allow_discounts?: boolean;
  auto_print_after_checkout?: boolean;
  auto_print_printer_name?: string | null;
  auto_print_paper_size?: AutoPrintPaperSize;
  enable_barcode?: boolean;
  enable_customer_selection?: boolean;
  allow_negative_stock?: boolean;
  default_low_stock_threshold?: number;
  default_payment_method?: DefaultPaymentMethod;
  tagline?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  website?: string | null;
  pan_number?: string | null;
  fssai_number?: string | null;
  drug_license_number?: string | null;
  msme_udyam_number?: string | null;
  social_links?: Record<string, string> | null;
  feedback_url?: string | null;
}

export interface ProductConfig {
  default_identifier_type: IdentifierType;
  enable_multiple_identifiers: boolean;
  primary_search_field: PrimarySearchField;
}

export interface BusinessPreferences {
  default_tax_percent: number;
  allow_discounts: boolean;
  auto_print_after_checkout: boolean;
  auto_print_printer_name: string | null;
  auto_print_paper_size: AutoPrintPaperSize;
  enable_barcode: boolean;
  enable_customer_selection: boolean;
  default_payment_method: DefaultPaymentMethod;
  decimal_precision: number;
  date_format: DateFormat;
}

export function getSettings(): Promise<Settings> {
  return request('/api/settings');
}

export function updateSettings(payload: SettingsUpdatePayload): Promise<Settings> {
  return request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
}

export function getProductConfig(): Promise<ProductConfig> {
  return request('/api/settings/product-config');
}

export function getBusinessPreferences(): Promise<BusinessPreferences> {
  return request('/api/settings/business-preferences');
}

export interface Branding {
  logo_url: string | null;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  pan_number: string | null;
  fssai_number: string | null;
  drug_license_number: string | null;
  msme_udyam_number: string | null;
  social_links: Record<string, string> | null;
  feedback_url: string | null;
}

export function getBranding(): Promise<Branding> {
  return request('/api/settings/branding');
}

export function uploadLogo(file: File): Promise<Settings> {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/settings/logo', { method: 'POST', body: formData });
}

/** Per-module toggles set by RevGenIQ Admin Portal staff (e.g. suspending access to a module
 * without suspending the whole tenant). Absent keys default to enabled. */
export type FeatureFlags = Record<string, boolean>;

export function getFeatureFlags(): Promise<FeatureFlags> {
  return request('/api/feature-flags');
}
