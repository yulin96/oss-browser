import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import { afterEach, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const filename = new URL('../src/renderer/src/components/previews/CodePreview.vue', import.meta.url)
const { descriptor } = parse(readFileSync(filename, 'utf8'))
const compiled = compileScript(descriptor, { id: 'code-preview-test' })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const scopes: vue.EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.clearAllTimers()
  vi.useRealTimers()
})

function fixture(): {
  props: { content: string; saving: boolean }
  state: { draft: vue.Ref<string>; dirty: vue.ComputedRef<boolean>; saveContent: () => void }
  emit: ReturnType<typeof vi.fn>
} {
  vi.useFakeTimers()
  const module = { exports: {} as { default: { setup: (...args: unknown[]) => unknown } } }
  const imports = (name: string): unknown => {
    if (name === 'vue') return { ...vue, onBeforeUnmount: vi.fn() }
    if (name.endsWith('.vue')) return {}
    if (name === '../../i18n') return { t: (text: string) => text }
    if (name === '../../utils/code-highlight') return { highlightCode: (text: string) => text }
    return require(name)
  }
  compileFunction(javascript, ['require', 'module', 'exports'])(imports, module, module.exports)
  const props = vue.reactive({ content: 'original', saving: false })
  const emit = vi.fn()
  const scope = vue.effectScope()
  scopes.push(scope)
  const state = scope.run(() => module.exports.default.setup(props, { expose: vi.fn(), emit }))
  return { props, state: state as ReturnType<typeof fixture>['state'], emit }
}

it.each(['new draft', 'original'])(
  'preserves edits made during a save, including %s',
  async (nextDraft) => {
    const { props, state, emit } = fixture()
    state.draft.value = 'submitted'
    state.saveContent()
    expect(emit).toHaveBeenCalledWith('save', 'submitted')
    props.saving = true
    state.draft.value = nextDraft
    props.content = 'submitted'
    props.saving = false
    await vue.nextTick()
    expect(state.draft.value).toBe(nextDraft)
    expect(state.dirty.value).toBe(true)
  }
)

it('marks the submitted draft as clean and accepts initial content updates', async () => {
  const { props, state } = fixture()
  props.content = 'loaded content'
  await vue.nextTick()
  expect(state.draft.value).toBe('loaded content')
  state.draft.value = 'submitted'
  state.saveContent()
  props.content = 'submitted'
  await vue.nextTick()
  expect(state.draft.value).toBe('submitted')
  expect(state.dirty.value).toBe(false)
})
