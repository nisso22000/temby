import { parse, serialize } from 'parse5';
import { toProxy } from './policy.js';

// Structural HTML rewriting only. Never mutate executable JS, integrity attributes or CSP.
export function rewriteHTML(html: string, base: URL): string {
  const doc = parse(html);
  function walk(node: any) {
    if (node.attrs) {
      const attrs = node.attrs as { name: string; value: string }[];
      for (const a of attrs) {
        if (['href','src','action','formaction','poster','data'].includes(a.name)) a.value = toProxy(a.value, base);
        if (a.name === 'srcset') a.value = a.value.split(',').map(v => { const [url, ...rest] = v.trim().split(/\s+/); return [toProxy(url, base), ...rest].join(' '); }).join(', ');
        if (a.name === 'target' || a.name === 'formtarget') a.value = '_self';
      }
      // Meta refresh is ordinary navigation, not script rewriting.
      if (node.tagName === 'meta' && attrs.some(a => a.name === 'http-equiv' && a.value.toLowerCase() === 'refresh')) {
        const content = attrs.find(a => a.name === 'content');
        if (content) content.value = content.value.replace(/(url\s*=\s*)(.*)$/i, (_, prefix, value) => prefix + toProxy(value.replace(/^['"]|['"]$/g, ''), base));
      }
    }
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(doc); return serialize(doc);
}
