#!/usr/bin/env python3
"""Build SAT-Sprint.html — the single-file, double-clickable version.

Inlines questions.js, app.js, and the woff2 fonts (as base64) into index.html
so the output runs from file:// with no other files and no network.
PWA-only tags (manifest, apple-touch-icon, service worker) stay in the hosted
version; they are inert on file:// but stripped here for tidiness.
"""
import base64
import re

html = open('index.html').read()
questions = open('questions.js').read()
app = open('app.js').read()
assert '</script' not in questions and '</script' not in app

for path in ('fonts/DMSans.woff2', 'fonts/SpaceGrotesk.woff2'):
    b64 = base64.b64encode(open(path, 'rb').read()).decode()
    html = html.replace(f"url('{path}')", f"url('data:font/woff2;base64,{b64}')")
assert "url('fonts/" not in html

html = html.replace('<script src="questions.js"></script>', '<script>\n' + questions + '\n</script>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + app + '\n</script>')
assert '<script src=' not in html

html = re.sub(r'\n<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = re.sub(r'\n<script>\s*// Offline support.*?</script>', '', html, flags=re.S)
assert 'serviceWorker' not in html

open('SAT-Sprint.html', 'w').write(html)
print(f'SAT-Sprint.html written ({len(html):,} chars)')
