# Spearyx Jobs App

This repository now runs as a standard single-package npm app (no monorepo workspace orchestration).

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run serve`
- `npm run test`
- `npm run deploy`

## Notes

- The active application is at repo root.
- Shared local libraries are consumed via `file:` dependencies from `./packages/*`.
- Legacy `apps/*` content can be removed after you confirm everything is stable.
