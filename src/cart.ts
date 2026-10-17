export interface Item {
  productId: string | null; skuId: string | null; title: string | null;
  quantity: number | null; unitPrice: number | null; variants: Record<string, string> | null;
}
export interface Cart {
  merchant: string; currency: string | null; items: Item[];
  subtotal: number | null; shipping: number | null; discount: number | null; total: number | null;
  complete: boolean; missing: string[]; source: string; observedAt: string | null;
}
export function unavailable(merchant = 'temu', reason = 'No verified cart response observed'): Cart {
  return { merchant, currency: null, items: [], subtotal: null, shipping: null, discount: null, total: null,
    complete: false, missing: [reason, 'currency', 'items', 'subtotal', 'shipping', 'discount', 'final checkout total'],
    source: 'unavailable', observedAt: null };
}
export interface MerchantAdapter {
  merchant: string;
  challenge(body: string, status: number): string | null;
  extract(url: URL, json: unknown): Cart | null;
}
export const temu: MerchantAdapter = {
  merchant: 'temu',
  challenge(body, status) {
    if ([401, 403, 429].includes(status)) return `Upstream access restriction (HTTP ${status})`;
    if (/\/assets\/chl\/js\//i.test(body)) return 'Temu JavaScript challenge loader (/assets/chl/js/)';
    if (/captcha|verify you are human|challenge-platform/i.test(body) && !/<title[^>]*>[^<]*Temu/i.test(body)) return 'Possible verification challenge; manual investigation required';
    return null;
  },
  // No real cart payload was available. Do not invent Temu field mappings or use catalogue prices as cart totals.
  extract() { return null; }
};

// Only the controlled fixture uses this explicit contract. It is NOT a claimed Temu API.
export function extractFixture(value: any): Cart {
  const cart = unavailable('fixture');
  cart.source = 'controlled fixture contract v1'; cart.observedAt = new Date().toISOString(); cart.missing = [];
  if (!value || typeof value !== 'object') { cart.missing.push('invalid payload'); return cart; }
  cart.currency = typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) ? value.currency : null;
  for (const key of ['subtotal', 'shipping', 'discount', 'total'] as const) {
    cart[key] = typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null;
    if (cart[key] === null) cart.missing.push(key);
  }
  if (!cart.currency) cart.missing.push('currency');
  if (!Array.isArray(value.items)) cart.missing.push('items');
  cart.items = Array.isArray(value.items) ? value.items.slice(0, 100).map((i: any, n: number): Item => {
    const item: Item = { productId: null, skuId: null, title: null, quantity: null, unitPrice: null, variants: null };
    for (const k of ['productId', 'skuId', 'title'] as const) if (typeof i?.[k] === 'string' && i[k]) item[k] = i[k];
    if (Number.isSafeInteger(i?.quantity) && i.quantity > 0) item.quantity = i.quantity;
    if (typeof i?.unitPrice === 'number' && Number.isFinite(i.unitPrice) && i.unitPrice >= 0) item.unitPrice = i.unitPrice;
    if (i?.variants && typeof i.variants === 'object' && !Array.isArray(i.variants) && Object.values(i.variants).every(v => typeof v === 'string')) item.variants = i.variants;
    for (const [k, v] of Object.entries(item)) if (v === null) cart.missing.push(`items[${n}].${k}`);
    return item;
  }) : [];
  if (value.items?.length > 100) cart.missing.push('too many items');
  if (value.stage !== 'checkout') cart.missing.push('final checkout confirmation');
  if (cart.subtotal !== null && cart.items.every(i => i.unitPrice !== null && i.quantity !== null) && Math.abs(cart.items.reduce((sum,i)=>sum+i.unitPrice!*i.quantity!,0)-cart.subtotal)>.011) cart.missing.push('item prices do not reconcile with subtotal');
  if (cart.subtotal !== null && cart.shipping !== null && cart.discount !== null && cart.total !== null && Math.abs(cart.subtotal + cart.shipping - cart.discount - cart.total) > .011) cart.missing.push('totals do not reconcile');
  cart.complete = cart.missing.length === 0;
  return cart;
}
