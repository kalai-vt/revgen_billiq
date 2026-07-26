import type { DocumentType, ItemColumnKey, PreviewData } from '@/features/invoice-designer/api';

interface SampleItem {
  product: string;
  sku: string;
  barcode: string;
  hsn_sac: string;
  batch: string;
  expiry: string;
  serial: string;
  description: string;
  qty: number;
  unit: string;
  mrp: number;
  selling_price: number;
  discount: number;
  tax: number;
  amount: number;
}

const SAMPLE_ITEMS: SampleItem[] = [
  {
    product: 'Basmati Rice 1kg', sku: 'RIC-001', barcode: '8901030875021', hsn_sac: '100630',
    batch: 'B2201', expiry: '12/2026', serial: '', description: 'Premium basmati rice',
    qty: 1, unit: 'pc', mrp: 130, selling_price: 120, discount: 0, tax: 0, amount: 120,
  },
  {
    product: 'Sunflower Oil 1L', sku: 'OIL-014', barcode: '8901030875045', hsn_sac: '151590',
    batch: 'B1187', expiry: '06/2027', serial: '', description: 'Refined sunflower oil',
    qty: 1, unit: 'pc', mrp: 155, selling_price: 145, discount: 0, tax: 0, amount: 145,
  },
  {
    product: 'Sugar 1kg', sku: 'SUG-009', barcode: '8901030875090', hsn_sac: '170114',
    batch: 'B0453', expiry: '01/2027', serial: '', description: 'Refined white sugar',
    qty: 2, unit: 'pc', mrp: 48, selling_price: 45, discount: 0, tax: 0, amount: 90,
  },
  {
    product: 'Tea Powder 250gm', sku: 'TEA-022', barcode: '8901030875113', hsn_sac: '090230',
    batch: 'B0921', expiry: '09/2027', serial: '', description: 'CTC tea powder',
    qty: 1, unit: 'pc', mrp: 95, selling_price: 85, discount: 0, tax: 0, amount: 85,
  },
];

function sampleItemValues(item: SampleItem): Partial<Record<ItemColumnKey, string>> {
  return {
    product: item.product,
    sku: item.sku,
    barcode: item.barcode,
    hsn_sac: item.hsn_sac,
    batch: item.batch,
    expiry: item.expiry,
    serial: item.serial || '-',
    description: item.description,
    qty: String(item.qty),
    unit: item.unit,
    mrp: item.mrp.toFixed(2),
    selling_price: item.selling_price.toFixed(2),
    discount: item.discount.toFixed(2),
    tax: item.tax.toFixed(2),
    amount: item.amount.toFixed(2),
  };
}

const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((sum, item) => sum + item.amount, 0);

const SAMPLE_DOCUMENT_LABELS: Record<DocumentType, { number: string; label: string }> = {
  tax_invoice: { number: 'INV-000245', label: 'Tax Invoice' },
  invoice: { number: 'INV-000112', label: 'Invoice' },
  estimate: { number: 'EST-000045', label: 'Estimate' },
  quotation: { number: 'QUO-000032', label: 'Quotation' },
  proforma: { number: 'PI-000018', label: 'Proforma Invoice' },
  delivery_challan: { number: 'DC-000091', label: 'Delivery Challan' },
  credit_note: { number: 'CN-000012', label: 'Credit Note' },
  debit_note: { number: 'DN-000007', label: 'Debit Note' },
  receipt: { number: 'RCP-000318', label: 'Receipt' },
};

export function buildSamplePreviewData(documentType: DocumentType): PreviewData {
  const info = SAMPLE_DOCUMENT_LABELS[documentType] ?? SAMPLE_DOCUMENT_LABELS.tax_invoice;
  return {
    documentLabel: info.label,
    number: info.number,
    date: '26/07/2026',
    time: '12:03 PM',
    dueDate: '02/08/2026',
    cashier: 'Karthik',
    counter: '01',
    orderNumber: 'ORD-1042',
    customerId: 'CUST-118',
    paymentMethod: 'UPI',
    paymentStatus: 'Paid',
    invoiceStatus: 'Completed',
    customer: {
      name: 'Priya Sharma',
      mobile: '+91 98765 43210',
      email: 'priya.sharma@example.com',
      address: '12, Gandhi Street, Coimbatore, Tamil Nadu - 641001',
      gstin: '33AAAAA0000A1Z5',
      loyalty_number: 'LOY-8821',
      membership: 'Gold',
      company_name: 'Sharma Traders',
    },
    items: SAMPLE_ITEMS.map((item) => ({ values: sampleItemValues(item) })),
    totals: {
      subtotal: SAMPLE_SUBTOTAL,
      discount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      round_off: 0,
      shipping: 0,
      packing: 0,
      grand_total: SAMPLE_SUBTOTAL,
      paid: SAMPLE_SUBTOTAL,
      outstanding: 0,
      balance: 0,
      amount_in_words: 'Rupees Four Hundred and Forty Only',
    },
  };
}
