# OSS Browser

An independent, third-party desktop client for Alibaba Cloud Object Storage Service (OSS), built with Electron, Vue 3, and TypeScript. It is designed for current macOS releases with first-class Apple Silicon support, while also providing Windows and Linux packages.

This project is inspired by [Alibaba OSS Browser](https://github.com/aliyun/oss-browser) and is not an official Alibaba Cloud product.

## Features

- AccessKey, STS, and authorization-code login
- Credentials protected by Electron `safeStorage`
- Bucket, folder, and object creation, upload, download, copy, move, delete, and permission management
- Direct navigation with `oss://bucket/path/` addresses
- Per-account home locations and favorites
- List and grid views with image thumbnails and file-type icons
- Preview support for images, video, audio, PDF, Office, and text files
- Temporary URLs, custom domains, image processing, and video frame extraction
- CDN cache refresh, RAM user management, temporary authorization codes, and multipart upload management
- Simplified Chinese, English, and Japanese interface languages
- Light, dark, and system appearance modes

## Development

Requirements:

- Node.js 24
- pnpm 11

Install dependencies:

```bash
pnpm install
```

Start the development application:

```bash
pnpm dev
```

Run checks:

```bash
pnpm typecheck
pnpm lint
```

## Local Packaging

Apple Silicon macOS:

```bash
pnpm build:mac:arm64
```

Intel and Apple Silicon macOS:

```bash
pnpm build:mac
```

Windows and Linux:

```bash
pnpm build:win
pnpm build:linux
```

Packaged files are written to the `dist` directory.

## Automated GitHub Releases

The workflow in [`.github/workflows/release.yml`](.github/workflows/release.yml) runs when a version tag matching `v*` is pushed. It builds:

- macOS ARM64 DMG for Apple Silicon
- macOS x64 DMG for Intel Macs
- Windows x64 NSIS installer and portable ZIP archive
- Linux x64 AppImage and DEB packages

After every platform finishes successfully, the workflow creates a GitHub Release and uploads all packages to it.

### Signing notice

Current packages are unsigned. macOS Gatekeeper and Windows SmartScreen may warn users when opening them.

On macOS, you might see a warning stating `“OSS Browser.app” is damaged and cannot be opened`. You can bypass this by removing the quarantine attribute. Open your terminal and run:

```bash
sudo xattr -r -d com.apple.quarantine /Applications/OSS\ Browser.app
```

## Local Data and Permissions

Saved credentials are encrypted with the operating system's secure storage. The application also stores account-specific home locations, favorites, display settings, and transfer history locally.

On macOS, application data is stored under:

```text
~/Library/Application Support/oss-browser
```

Listing custom Bucket domains requires `oss:ListCname`. CDN refresh requires `cdn:RefreshObjectCaches` and may generate origin traffic.

## Application Icons

- Runtime icon: `resources/icon.png`
- macOS package icon: `build/icon.icns`

## Acknowledgements

Inspired by [Alibaba OSS Browser](https://github.com/aliyun/oss-browser).

## License

Licensed under the [MIT License](LICENSE).
