#!/usr/bin/env node
// Derive the PWA icons from the group icon (OFF-01). The 1024 px original is not shipped.
// usage: node tools/icons.mjs <group-icon.png>   (needs `sharp`)
import sharp from 'sharp';
const src = process.argv[2];
if (!src) { console.error('usage: icons.mjs <group-icon.png>'); process.exit(2); }
const o = new URL('../site/assets/icons/', import.meta.url).pathname;
const png = { compressionLevel: 9, palette: true, quality: 88 };
await sharp(src).resize(192, 192).png(png).toFile(o + 'icon-192.png');
await sharp(src).resize(512, 512).png(png).toFile(o + 'icon-512.png');
// maskable: full-bleed in the icon's own edge colour (a light margin shows as a white frame on Android)
await sharp(src).resize(480, 480).extend({ top: 16, bottom: 16, left: 16, right: 16, background: '#0d3830' }).png(png).toFile(o + 'icon-512-maskable.png');
await sharp(src).resize(180, 180).flatten({ background: '#0d3830' }).png(png).toFile(o + 'apple-touch-icon.png');
console.log('icons written to', o);
