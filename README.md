# Dynamic QR

Sandboxed EmDash plugin for **dynamic QR codes** with style presets, live PNG preview, multi-size downloads, and detailed scan analytics.

## Features

- Create QR codes that encode a stable **scan URL** (change the destination later without reprinting)
- **Customization**: style presets (Classic, Midnight, Ocean, Forest, Inverted), foreground/background hex colors, quiet-zone margin, export size (128–1024px), error correction (L/M/Q/H)
- **Live preview** in the admin code detail view (PNG from the public image endpoint) plus a Refresh preview action
- **Downloads**: Preview PNG, Download PNG (current size), Download 512px, Download 1024px, and Open scan URL — requires Public site base URL
- **Analytics**: per-code dashboard with 24h / 7d / 30d stats, 30-day timeseries, device and country pie charts, top referrers and cities, and a recent scan log
- Public redirect records scans (time, hashed IP, user agent, referer, geo when available)
- Settings for public base URL and default style

## Admin UX

| Page | What you get |
| ---- | ------------ |
| Codes | Create / Library tabs; detail view with preview, style editor, download actions |
| Analytics | Code picker, summary table, charts, breakdowns, scan log |
| Settings | Public site base URL and default colors / ECC |

## Public endpoints

After install on a site:

- Scan / redirect: `/_emdash/api/plugins/dynamic-qr/go?code=<slug>`
- PNG image: `/_emdash/api/plugins/dynamic-qr/image?code=<slug>`
- Preview size: `.../image?code=<slug>&size=320`
- Force download: `.../image?code=<slug>&download=1` (optional `&size=512` or `&size=1024`)

Set **Public site base URL** in plugin settings so admin screens show absolute links and generated PNGs encode the scan URL (not the raw destination).

## Develop

```sh
pnpm install
pnpm run validate
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run bundle
```

## Publish

```sh
pnpm exec emdash-plugin login <your-handle>
pnpm run publish
```

Current package version: **0.2.0**. Optional GitHub Actions delegated releases: `pnpm run release:setup`.

## License

MIT
