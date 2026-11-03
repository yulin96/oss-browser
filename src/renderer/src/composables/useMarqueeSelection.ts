import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'

export function useMarqueeSelection(
  surface: Ref<HTMLElement | null>,
  selectedNames: Ref<Set<string>>
): {
  marqueeStyle: ComputedRef<Record<string, string> | undefined>
  startMarquee: (event: PointerEvent) => void
  suppressMarqueeClick: (event: MouseEvent) => void
  cancelMarquee: () => void
} {
  const rectangle = ref<{ left: number; top: number; width: number; height: number }>()
  const marqueeStyle = computed(() =>
    rectangle.value
      ? Object.fromEntries(
          Object.entries(rectangle.value).map(([key, value]) => [key, `${value}px`])
        )
      : undefined
  )
  let gesture:
    | {
        element: HTMLElement
        pointerId: number
        clientX: number
        clientY: number
        startClientX: number
        startClientY: number
        startX: number
        startY: number
        initial: Set<string>
        additive: boolean
        items: Array<{ name: string; left: number; top: number; right: number; bottom: number }>
      }
    | undefined
  let frame = 0
  let suppressClick = false
  let clickTimer: ReturnType<typeof setTimeout> | undefined

  function updateSelection(): void {
    if (!gesture) return
    const { element, startX, startY } = gesture
    const bounds = element.getBoundingClientRect()
    const x =
      Math.max(
        0,
        Math.min(element.clientWidth, gesture.clientX - bounds.left - element.clientLeft)
      ) + element.scrollLeft
    const y =
      Math.max(
        0,
        Math.min(element.clientHeight, gesture.clientY - bounds.top - element.clientTop)
      ) + element.scrollTop
    const left = Math.min(startX, x)
    const top = Math.min(startY, y)
    const right = Math.max(startX, x)
    const bottom = Math.max(startY, y)
    rectangle.value = { left, top, width: right - left, height: bottom - top }
    const next = new Set(gesture.additive ? gesture.initial : [])
    for (const item of gesture.items) {
      if (item.left < right && item.right > left && item.top < bottom && item.bottom > top) {
        next.add(item.name)
      }
    }
    selectedNames.value = next
  }

  function autoScroll(): void {
    if (!gesture) return
    const { element, clientY } = gesture
    const bounds = element.getBoundingClientRect()
    const top = bounds.top + element.clientTop
    const bottom = top + element.clientHeight
    const speed =
      clientY < top + 32
        ? -Math.min(18, (top + 32 - clientY) / 2)
        : clientY > bottom - 32
          ? Math.min(18, (clientY - bottom + 32) / 2)
          : 0
    const previousTop = element.scrollTop
    element.scrollTop += speed
    if (element.scrollTop !== previousTop) updateSelection()
    frame = requestAnimationFrame(autoScroll)
  }

  function move(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    gesture.clientX = event.clientX
    gesture.clientY = event.clientY
    if (!rectangle.value) {
      if (
        Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY) < 5
      )
        return
      const { element } = gesture
      const bounds = element.getBoundingClientRect()
      gesture.items = [...element.querySelectorAll<HTMLElement>('[data-object-name]')].map(
        (item) => {
          const rect = item.getBoundingClientRect()
          return {
            name: item.dataset.objectName!,
            left: rect.left - bounds.left - element.clientLeft + element.scrollLeft,
            top: rect.top - bounds.top - element.clientTop + element.scrollTop,
            right: rect.right - bounds.left - element.clientLeft + element.scrollLeft,
            bottom: rect.bottom - bounds.top - element.clientTop + element.scrollTop
          }
        }
      )
      suppressClick = true
      frame = requestAnimationFrame(autoScroll)
    }
    event.preventDefault()
    updateSelection()
  }

  function finish(): void {
    cancelAnimationFrame(frame)
    gesture?.element.removeEventListener('scroll', handleScroll)
    gesture = undefined
    rectangle.value = undefined
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', cancelMarquee)
    window.removeEventListener('blur', cancelMarquee)
    window.removeEventListener('keydown', keydown)
  }

  function release(event: PointerEvent): void {
    if (gesture?.pointerId !== event.pointerId) return
    if (rectangle.value) move(event)
    finish()
    // The click dispatched immediately after pointerup must not open or deselect an object.
    if (suppressClick) clickTimer = setTimeout(() => (suppressClick = false), 0)
  }

  function cancelMarquee(): void {
    finish()
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (gesture && rectangle.value) selectedNames.value = gesture.initial
      cancelMarquee()
    }
  }

  function handleScroll(): void {
    if (rectangle.value) updateSelection()
  }

  function startMarquee(event: PointerEvent): void {
    const element = surface.value
    if (!element || event.button !== 0 || event.pointerType !== 'mouse') return
    const target = event.target as HTMLElement
    if (
      target.closest(
        'input, .object-card-check, .object-group-heading, .table-head, .load-more, .empty-state'
      )
    )
      return
    const bounds = element.getBoundingClientRect()
    const clientX = event.clientX - bounds.left - element.clientLeft
    const clientY = event.clientY - bounds.top - element.clientTop
    if (clientX >= element.clientWidth || clientY >= element.clientHeight) return
    clearTimeout(clickTimer)
    suppressClick = false
    gesture = {
      element,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: clientX + element.scrollLeft,
      startY: clientY + element.scrollTop,
      initial: new Set(selectedNames.value),
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      items: []
    }
    element.addEventListener('scroll', handleScroll)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancelMarquee)
    window.addEventListener('blur', cancelMarquee)
    window.addEventListener('keydown', keydown)
  }

  function suppressMarqueeClick(event: MouseEvent): void {
    if (!suppressClick) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
  }

  onBeforeUnmount(() => {
    cancelMarquee()
    clearTimeout(clickTimer)
  })

  return { marqueeStyle, startMarquee, suppressMarqueeClick, cancelMarquee }
}
