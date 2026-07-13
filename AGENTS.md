# OSS Browser Development Guidelines

## Project Goal

OSS Browser is a modern Electron implementation inspired by Alibaba OSS Browser. Phase one prioritizes functional completeness without carrying forward obsolete logs, build artifacts, or legacy compatibility code. macOS development should prioritize Apple Silicon while retaining cross-platform packaging support.

Repository: <https://github.com/yulin96/oss-browser>

## Technology and Commands

- Use pnpm as the only package manager.
- Use TypeScript in the main process, preload, and renderer.
- The core stack is Electron, Vue 3, electron-vite, Tailwind CSS, shadcn-vue, and ali-oss.
- Run the development application with `pnpm dev`.
- Use `pnpm typecheck` and `pnpm lint` for normal validation.
- Do not run packaging or production builds unless explicitly requested.

## Implementation Rules

- Keep OSS, RAM, STS, CDN, filesystem, and system capabilities in the main process. The renderer must not access Node.js directly.
- Define cross-process interfaces in `src/shared/types.ts`, then update the main process and preload together.
- Store credentials only through `ProfileStore` and Electron `safeStorage`. Never write credentials to localStorage or logs.
- Scope home locations, favorites, and selected domains by account. The account identity is the Endpoint plus AccessKey ID.
- Prefer Lucide and Lucide Lab icons. Use `resources/icon.png` and `build/icon.icns` for the application icon.
- Use shadcn-vue for reusable primitives such as alert dialogs and tooltips when an appropriate component exists.
- Implement clickable application buttons with `div`-based components rather than native HTML `button` elements.
- Put input borders and backgrounds on wrapper elements rather than directly on `input` elements.
- Keep changes direct and focused. Do not create one-use abstractions or preserve confirmed dead code.
- Preserve intentional type suppression comments unless the user explicitly requests their removal.

## Interface Rules

- Keep the file area full-screen without a permanent left sidebar.
- Preserve the top path input, back, forward, parent, refresh, favorite, and home actions.
- Use the same large modal size for favorites, saved accounts, and settings.
- Confirm destructive or externally significant actions, including logout, deletion, and CDN cache refresh.
- Use the same object actions in the More menu and context menu. Every menu item must include an icon, and menus must close when focus moves away.
- Add tooltips to icon-only actions.

## Release Rules

- GitHub releases are triggered by semantic version tags such as `v0.2.0`.
- The Git tag must match the `package.json` version with a leading `v`.
- Keep `.github/workflows/release.yml` capable of producing macOS ARM64/x64, Windows x64, and Linux x64 packages.
- On macOS, check for updates in the app but direct users to GitHub Releases for downloads. Do not download or install updates in the app.
- Do not commit generated `dist` packages to the repository.
- Treat Apple signing, notarization, and Windows signing credentials as GitHub secrets. Never commit signing credentials.

## Attribution

The project is inspired by [Alibaba OSS Browser](https://github.com/aliyun/oss-browser) and is maintained independently at [yulin96/oss-browser](https://github.com/yulin96/oss-browser).
