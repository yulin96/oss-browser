import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

describe('GitHub release configuration', () => {
  it('uses public GitHub updates and stable architecture-specific macOS package names', async () => {
    const builder = parse(await readFile('electron-builder.yml', 'utf8'))
    expect(builder.publish).toEqual({
      provider: 'github',
      owner: 'yulin96',
      repo: 'oss-browser',
      private: false,
      releaseType: 'release'
    })
    expect(builder.mac.artifactName).toBe('${name}-${version}-${arch}.${ext}')
    expect(builder.dmg.artifactName).toBe('${name}-${version}-${arch}.${ext}')
  })

  it('publishes all platform update manifests and Homebrew aliases without OSS configuration', async () => {
    const workflow = parse(await readFile('.github/workflows/release.yml', 'utf8'))
    expect(workflow.permissions).toEqual({ contents: 'write' })
    const targets = workflow.jobs.build.strategy.matrix.include
    expect(targets).toHaveLength(3)
    expect(targets[0].command).toContain('--mac dmg zip --arm64 --x64 --publish never')
    expect(targets[1].command).toContain('--win nsis zip --x64 --publish never')
    expect(targets[2].command).toContain('--linux AppImage deb --x64 --publish never')
    expect(targets[0].files.split('\n')).toContain('dist/latest-mac.yml')
    expect(targets[1].files.split('\n')).toContain('dist/latest.yml')
    expect(targets[2].files.split('\n')).toContain('dist/latest-linux.yml')
    const steps = [...workflow.jobs.build.steps, ...workflow.jobs.release.steps]
    expect(
      steps
        .flatMap((step: { env?: Record<string, string> }) => Object.keys(step.env ?? {}))
        .filter((name: string) => name.startsWith('OSS_'))
    ).toEqual([])
    expect(
      steps.some((step: { run?: string }) =>
        /upload-release-to-oss|OSS_[A-Z_]+/.test(step.run ?? '')
      )
    ).toBe(false)
    const homebrew = workflow.jobs.release.steps.find(
      (step: { name: string }) => step.name === 'Prepare stable Homebrew downloads'
    )
    expect(homebrew.run).toContain('release-assets/oss-browser-latest-arm64.dmg')
    expect(homebrew.run).toContain('release-assets/oss-browser-latest-x64.dmg')
    const publish = workflow.jobs.release.steps.find(
      (step: { name: string }) => step.name === 'Create release and upload files'
    )
    expect(publish.env).toEqual({ GH_TOKEN: '${{ github.token }}' })
    expect(publish.run).toContain('--draft\n')
    expect(publish.run).toContain('--draft=false')
  })
})
