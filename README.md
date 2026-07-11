# OSS Browser

A modern desktop client for Alibaba Cloud Object Storage Service (OSS), built with Electron, Vue 3, and TypeScript. It is designed for current macOS releases with first-class Apple Silicon support, while also providing Windows and Linux packages.

This project is inspired by [Alibaba OSS Browser](https://github.com/aliyun/oss-browser). It is an independent modern implementation and is not an official Alibaba Cloud product.

Repository: [github.com/yulin96/oss-browser](https://github.com/yulin96/oss-browser)

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

- Node.js 22
- pnpm 10

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

### Publish a release

1. Update the `version` field in `package.json`, for example to `0.2.0`.
2. Commit and push the release changes to the default branch.
3. Create a tag with the same version prefixed by `v`.
4. Push the tag to GitHub.

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: prepare v0.2.0"
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

The tag must match the package version exactly. For example, package version `0.2.0` requires tag `v0.2.0`. Progress is available on the repository's **Actions** page. When all jobs pass, downloadable files appear under **Releases**.

No personal access token is required for the standard workflow. GitHub provides a temporary token, and the workflow requests only `contents: write` permission to create the Release.

### Signing notice

Current packages are unsigned. macOS Gatekeeper and Windows SmartScreen may warn users when opening them. Public production releases should add Apple code signing and notarization, and optionally Windows code signing.

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
