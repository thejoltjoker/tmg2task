# Trofeo Montegrappa Task -> XCTSK

SvelteKit app that fetches the current Trofeo Montegrappa task, visualizes it, and provides two QR-based import paths for XCTrack/FlySkyHy-compatible `.xctsk` tasks.

## What it does

- Fetches the current task from Airtribune (`feed_task.json`)
- Falls back to Flymaster JSON if Airtribune is unavailable
- Normalizes turnpoints and task timing metadata
- Builds an XCTSK payload and exposes it via `GET /download.xctsk`
- Renders:
  - task metadata
  - turnpoint table
  - interactive map with cylinders and optimized route line
  - two QR codes:
    - full inline `XCTSK:` payload
    - fallback QR with download URL

## Key routes

- `/` - main task dashboard
- `/download.xctsk` - returns `application/xctsk` attachment for direct download/import

## Data sources

- Primary: `https://api.airtribune.com/feed_task.json`
- Fallback: Flymaster group/kml JSON endpoint (resolved dynamically, then static fallback)

## Local development

Install dependencies:

```sh
pnpm install
```

Run dev server:

```sh
pnpm dev
```

Run with browser auto-open:

```sh
pnpm dev -- --open
```

## Build and preview

Build production bundle:

```sh
pnpm build
```

Preview production build:

```sh
pnpm preview
```
