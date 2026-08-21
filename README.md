# PonyMux Web

The website, blog, and future documentation for PonyMux.

Built with [Blume](https://useblume.dev/), Astro, and Markdown.

## Development

```sh
bun install
bun run dev
```

Create a production build with:

```sh
bun run build
```

## Update assets

The Worker serves release assets from the private `ponymux-update` R2 bucket:

- `/update/appcast.xml` reads the `appcast.xml` object.
- `/update/PonyMux-x.y.z.dmg` reads the matching versioned DMG object.
- `/download` reads `latest.json` and redirects to its `dmg` file.

`latest.json` has this shape:

```json
{
  "version": "0.1.0",
  "dmg": "PonyMux-0.1.0.dmg"
}
```

For local development, populate Wrangler's local R2 storage before starting the
preview server:

```sh
npx wrangler r2 object put ponymux-update/PonyMux-0.1.0.dmg \
  --file /tmp/PonyMux-0.1.0.dmg \
  --local
npx wrangler r2 object put ponymux-update/appcast.xml \
  --file /tmp/test-appcast.xml \
  --local
npx wrangler r2 object put ponymux-update/latest.json \
  --file /tmp/latest.json \
  --local
bun run preview
```

For a release, upload the signed and notarized versioned DMG first, then the
generated `appcast.xml`, and update `latest.json` last. Use `--remote` for the
production bucket. Keep versioned release files immutable.
