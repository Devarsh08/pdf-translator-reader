# PDF Translator Reader

Offline-capable PDF reader with hover-to-translate, using pre-downloaded language packs.

## Live app
This repo is deployed via GitHub Pages. See repository Settings > Pages for the live URL
(Settings > Pages > Source: Deploy from branch `main`, folder `/ (root)`).

## How it works
- PDF rendering via PDF.js (loaded from CDN, cached offline by the Service Worker).
- Hover over any word to see its meaning; click a line for a full sentence breakdown.
- Language packs are JSON dictionaries in `langpacks/`. Once loaded once, they are cached
  by `sw.js` for fully offline use.

## Add more languages
Drop a file named `<source>-<target>.json` into `langpacks/`, following the same
`{"source":"xx","target":"yy","words":{...}}` structure as `fr-en.json`.
