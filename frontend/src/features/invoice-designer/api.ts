import { request } from '@/lib/api-client';

export type DocumentType =
  | 'tax_invoice'
  | 'estimate'
  | 'quotation'
  | 'proforma'
  | 'delivery_challan'
  | 'credit_note'
  | 'debit_note'
  | 'receipt';

export const DOCUMENT_TYPES: DocumentType[] = [
  'tax_invoice',
  'estimate',
  'quotation',
  'proforma',
  'delivery_challan',
  'credit_note',
  'debit_note',
  'receipt',
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tax_invoice: 'Tax Invoice',
  estimate: 'Estimate',
  quotation: 'Quotation',
  proforma: 'Proforma Invoice',
  delivery_challan: 'Delivery Challan',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  receipt: 'Receipt',
};

export type HeaderLayout = 'logo-left' | 'logo-center' | 'logo-right' | 'banner' | 'minimal' | 'modern-card';
export type HeaderHeight = 'compact' | 'normal' | 'tall';
export type ItemColumnKey =
  | 'row_number'
  | 'product'
  | 'sku'
  | 'barcode'
  | 'hsn_sac'
  | 'batch'
  | 'expiry'
  | 'serial'
  | 'description'
  | 'qty'
  | 'unit'
  | 'mrp'
  | 'selling_price'
  | 'discount'
  | 'tax'
  | 'amount';
export type ColumnAlign = 'left' | 'center' | 'right';
export type FooterKey = 'thank_you' | 'return_policy' | 'exchange_policy' | 'warranty' | 'terms_conditions' | 'business_notes';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type FontSizeChoice = 'sm' | 'md' | 'lg';
export type BorderStyleChoice = 'solid' | 'dashed' | 'none';
export type TableStyleChoice = 'grid' | 'striped' | 'minimal';
export type DividerStyleChoice = 'solid' | 'dashed' | 'dotted';
export type CornerRadiusChoice = 'none' | 'sm' | 'md' | 'lg';
export type IconStyleChoice = 'outline' | 'filled';
export type PaperSize = '58mm' | '80mm' | 'A5' | 'A4' | 'letter' | 'legal' | 'custom';
export type Orientation = 'portrait' | 'landscape';
export type LogoSizePreset = 'sm' | 'md' | 'lg';

export const ITEM_COLUMN_LABELS: Record<ItemColumnKey, string> = {
  row_number: 'Row Number (#)',
  product: 'Product',
  sku: 'SKU',
  barcode: 'Barcode',
  hsn_sac: 'HSN/SAC',
  batch: 'Batch Number',
  expiry: 'Expiry Date',
  serial: 'Serial Number',
  description: 'Description',
  qty: 'Quantity',
  unit: 'Unit',
  mrp: 'MRP',
  selling_price: 'Selling Price',
  discount: 'Discount',
  tax: 'Tax',
  amount: 'Amount',
};

export const FOOTER_SECTION_LABELS: Record<FooterKey, string> = {
  thank_you: 'Thank You Message',
  return_policy: 'Return Policy',
  exchange_policy: 'Exchange Policy',
  warranty: 'Warranty Information',
  terms_conditions: 'Terms & Conditions',
  business_notes: 'Business Notes',
};

export interface BrandingConfig {
  show_logo: boolean;
  show_business_name: boolean;
  show_tagline: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_email: boolean;
  show_website: boolean;
  show_gstin: boolean;
  show_pan: boolean;
  show_fssai: boolean;
  show_drug_license: boolean;
  show_msme_udyam: boolean;
  show_social_links: boolean;
  social_links_to_show: string[];
}

export interface HeaderConfig {
  layout: HeaderLayout;
  background_color: string | null;
  show_border: boolean;
  show_divider: boolean;
  border_radius: number;
  height_preset: HeaderHeight;
}

export interface InvoiceInfoConfig {
  fields: {
    invoice_number: boolean;
    date: boolean;
    time: boolean;
    due_date: boolean;
    cashier: boolean;
    counter: boolean;
    order_number: boolean;
    customer_id: boolean;
    payment_method: boolean;
    payment_status: boolean;
    invoice_status: boolean;
  };
}

export interface CustomerDetailsConfig {
  fields: {
    name: boolean;
    mobile: boolean;
    email: boolean;
    address: boolean;
    gstin: boolean;
    loyalty_number: boolean;
    membership: boolean;
    company_name: boolean;
  };
}

export interface ItemColumn {
  key: ItemColumnKey;
  visible: boolean;
  order: number;
  width: number | null;
  align: ColumnAlign;
}

export interface ItemTableConfig {
  columns: ItemColumn[];
  show_borders: boolean;
  alternate_row_colors: boolean;
}

export interface TaxSummaryConfig {
  fields: {
    subtotal: boolean;
    discount: boolean;
    cgst: boolean;
    sgst: boolean;
    igst: boolean;
    cess: boolean;
    round_off: boolean;
    shipping: boolean;
    packing: boolean;
    grand_total: boolean;
    paid: boolean;
    outstanding: boolean;
    balance: boolean;
    amount_in_words: boolean;
  };
}

export interface FooterSection {
  key: FooterKey;
  enabled: boolean;
  text: string;
  order: number;
}

export interface FooterConfig {
  sections: FooterSection[];
}

export interface QrBarcodeConfig {
  invoice_qr: boolean;
  payment_qr: boolean;
  business_qr: boolean;
  website_qr: boolean;
  feedback_qr: boolean;
  barcode: boolean;
}

export interface ThemeConfig {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: FontFamily;
  font_size: FontSizeChoice;
  border_style: BorderStyleChoice;
  table_style: TableStyleChoice;
  divider_style: DividerStyleChoice;
  corner_radius: CornerRadiusChoice;
  icon_style: IconStyleChoice;
}

export interface MarginMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PaperConfig {
  size: PaperSize;
  custom_width_mm: number | null;
  custom_height_mm: number | null;
  orientation: Orientation;
  margin_mm: MarginMm;
  logo_size_preset: LogoSizePreset;
  font_scale_percent: number;
  auto_fit: boolean;
}

export interface InvoiceTemplateConfig {
  version: 1;
  branding: BrandingConfig;
  header: HeaderConfig;
  invoice_info: InvoiceInfoConfig;
  customer_details: CustomerDetailsConfig;
  item_table: ItemTableConfig;
  tax_summary: TaxSummaryConfig;
  footer: FooterConfig;
  qr_barcode: QrBarcodeConfig;
  theme: ThemeConfig;
  paper: PaperConfig;
}

export interface InvoiceTemplate {
  id: string;
  tenant_id: string;
  document_type: DocumentType;
  name: string;
  is_default: boolean;
  is_builtin: boolean;
  config: InvoiceTemplateConfig;
}

export function listTemplates(documentType?: DocumentType): Promise<InvoiceTemplate[]> {
  const query = documentType ? `?document_type=${documentType}` : '';
  return request(`/api/invoice-templates${query}`);
}

export function getDefaultTemplates(): Promise<Record<DocumentType, InvoiceTemplate>> {
  return request('/api/invoice-templates/defaults');
}

export function getTemplate(id: string): Promise<InvoiceTemplate> {
  return request(`/api/invoice-templates/${id}`);
}

export function createTemplate(payload: {
  document_type: DocumentType;
  name: string;
  config?: InvoiceTemplateConfig;
}): Promise<InvoiceTemplate> {
  return request('/api/invoice-templates', { method: 'POST', body: JSON.stringify(payload) });
}

export function duplicateTemplate(id: string): Promise<InvoiceTemplate> {
  return request(`/api/invoice-templates/${id}/duplicate`, { method: 'POST' });
}

export function updateTemplate(
  id: string,
  payload: { name?: string; config?: InvoiceTemplateConfig },
): Promise<InvoiceTemplate> {
  return request(`/api/invoice-templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTemplate(id: string): Promise<void> {
  return request(`/api/invoice-templates/${id}`, { method: 'DELETE' });
}

export function setDefaultTemplate(id: string): Promise<InvoiceTemplate> {
  return request(`/api/invoice-templates/${id}/set-default`, { method: 'POST' });
}
