import { nextTick, onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const ESCAPE_KEY = 'Escape'

type SiteMenuRefs = Readonly<{
  root: Ref<HTMLElement | null>
  toggle: Ref<HTMLElement | null>
  panel: Ref<HTMLElement | null>
}>

/**
 * Disclosure state for the floating site menu: open/close, document-level Escape and
 * click-outside, route-change collapse and focus hand-off between toggle and first link.
 */
export function useSiteMenu(refs: SiteMenuRefs) {
  const isOpen = ref(false)
  const route = useRoute()

  const focusToggle = () => refs.toggle.value?.focus()

  const close = () => {
    if (!isOpen.value) return
    isOpen.value = false
  }

  const open = async () => {
    isOpen.value = true
    await nextTick()
    refs.panel.value?.querySelector<HTMLElement>('a, button')?.focus()
  }

  const toggle = () => (isOpen.value ? close() : open())

  const closeAndRefocus = () => {
    if (!isOpen.value) return
    close()
    focusToggle()
  }

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === ESCAPE_KEY) closeAndRefocus()
  }

  const onPointerDownOutside = (event: Event) => {
    const target = event.target
    if (!isOpen.value || !(target instanceof Node)) return
    if (refs.root.value?.contains(target)) return
    close()
  }

  watch(() => route.fullPath, close)

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDownOutside)
    document.addEventListener('keydown', onDocumentKeydown)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDownOutside)
    document.removeEventListener('keydown', onDocumentKeydown)
  })

  return { isOpen, open, close, toggle }
}
