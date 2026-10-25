const esc = s => String(s).replace(/&/g, '&amp;');
const candidates = {
  base64: 'Base64 & Data URI Converter | Bench',
  annotate: 'Text, Captions & Annotations | Bench',
  splitter: 'Image Splitter & Grid Cutter | Bench',
  favicon: 'Favicon & App Icon Generator | Bench',
  'gif-studio': 'GIF Studio: Create & Extract | Bench',
  inspection: 'Image Inspector & Diagnostics | Bench',
  'photo-signature': 'Photo & Signature Composition | Bench'
};
Object.keys(candidates).forEach(k => {
  const c = candidates[k];
  console.log(k, '| escaped', esc(c).length, '|', c);
});
