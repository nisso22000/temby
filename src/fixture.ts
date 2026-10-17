import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Session } from './sessions.js';
import { extractFixture } from './cart.js';
import { readBody } from './proxy.js';

export function fixtureCart(s: Session) {
  const q = s.fixture.quantity;
  return extractFixture({ currency:'USD', stage:s.fixture.stage, items:q ? [{productId:'fixture-1',skuId:`fixture-${s.fixture.color}`,title:'Test travel pouch',quantity:q,unitPrice:12.5,variants:{color:s.fixture.color,size:'M'}}] : [],subtotal:q*12.5,shipping:3,discount:0,total:q*12.5+3 });
}
export async function fixture(req: IncomingMessage, res: ServerResponse, s: Session, appOrigin = 'http://localhost:3000') {
  const url = new URL(req.url!, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/_fixture/update') {
    const body = new URLSearchParams((await readBody(req))?.toString());
    const quantity = Number(body.get('quantity')); const color = body.get('color');
    if (!Number.isSafeInteger(quantity) || quantity<0 || quantity>20 || !['Black','Blue'].includes(color || '')) { res.writeHead(400); res.end('Invalid fixture data'); return; }
    s.fixture={quantity,color:color!,stage:'cart'};
    res.writeHead(303,{location:'/_fixture/cart'}); res.end(); return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const page=url.pathname.split('/').pop();
  s.fixture.stage = page==='checkout' ? 'checkout' : 'cart';
  const cart=fixtureCart(s);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors ${appOrigin}`});
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled fixture · ${page}</title><style>body{font:16px system-ui;padding:20px;color:#16332c;background:#fff}nav{display:flex;gap:16px;flex-wrap:wrap}h1{font-size:25px}label{display:block;margin:18px 0}input,select,button{font:inherit;padding:12px;max-width:100%;box-sizing:border-box}a{color:#126b54}button{background:#126b54;color:white;border:0;border-radius:9px}aside{background:#fff0cf;padding:12px}article{margin:24px 0;padding:20px;border:1px solid #dae4df;border-radius:16px}</style><aside>CONTROLLED FIXTURE — synthetic products and amounts. This is not Temu.</aside><nav><a href="/_fixture/home">Home</a><a href="/_fixture/category">Category</a><a href="/_fixture/product">Product</a><a href="/_fixture/cart">Cart (${s.fixture.quantity})</a></nav><h1>${page==='checkout' ? 'Fixture checkout preview' : page==='cart' ? 'Fixture cart' : 'Test travel pouch'}</h1><form action="/_fixture/search"><label>Search fixture<input name="q" placeholder="Search fixture"></label><button>Search</button></form><article><p>Test travel pouch · USD 12.50</p><form action="/_fixture/update" method="post"><label>Color<select name="color"><option${s.fixture.color==='Black'?' selected':''}>Black</option><option${s.fixture.color==='Blue'?' selected':''}>Blue</option></select></label><label>Quantity<input name="quantity" type="number" min="0" max="20" value="${s.fixture.quantity || 1}"></label><button>${s.fixture.quantity ? 'Update cart' : 'Add to cart'}</button></form></article><p>Subtotal USD ${cart.subtotal?.toFixed(2)} · Shipping USD 3.00 · Discount USD 0.00</p><p>Total USD ${cart.total?.toFixed(2)}</p><a href="/_fixture/checkout">Reach fixture checkout</a><p>No purchase submission is implemented.</p>`);
}
