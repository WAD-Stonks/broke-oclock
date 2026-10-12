<script setup lang="ts">
import { SITE_MENU_ID, SITE_NAV_LINKS, SITE_TITLE } from '@web/components/site-nav-links'
import { useSiteMenu } from '@web/components/use-site-menu'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const root = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)

const { isOpen, close, toggle } = useSiteMenu({ root, toggle: toggleButton, panel })
</script>

<template>
  <header ref="root" class="site-header" :class="{ 'is-open': isOpen }">
    <nav aria-label="Primary navigation" class="site-pill" data-testid="primary-nav">
      <RouterLink class="site-brand" to="/" @click="close">{{ SITE_TITLE }}</RouterLink>

      <button
        ref="toggleButton"
        type="button"
        class="site-toggle"
        data-testid="nav-toggle"
        :aria-controls="SITE_MENU_ID"
        :aria-expanded="isOpen"
        :aria-label="isOpen ? 'Close menu' : 'Open menu'"
        @click="toggle"
      >
        <span class="site-toggle__bar" aria-hidden="true" />
        <span class="site-toggle__bar" aria-hidden="true" />
        <span class="site-toggle__bar" aria-hidden="true" />
      </button>

      <Transition name="site-menu">
        <ul
          v-if="isOpen"
          :id="SITE_MENU_ID"
          ref="panel"
          class="site-menu"
          data-testid="nav-menu"
        >
          <li
            v-for="(link, index) in SITE_NAV_LINKS"
            :key="link.to"
            class="site-menu__item"
            :style="{ '--i': index }"
          >
            <RouterLink class="site-menu__link" :to="link.to" @click="close">
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </Transition>
    </nav>
  </header>
</template>

<style scoped>
/* Floating pill, Google-Maps style: fixed over the page, above Leaflet's controls (z 1000). */
.site-header {
  padding: 0 var(--spacing-20);
  --pill-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --pill-duration: 420ms;
  --menu-duration: 360ms;
  --stagger: 40ms;
  position: fixed;
  top: var(--spacing-20);
  z-index: 1100;
  width: min(calc(100% - 2 * var(--spacing-20)), 22rem);
  font-family: var(--font-founders-grotesk);
  letter-spacing: -0.02em;
  font-feature-settings: "clig", "liga";
}

.site-pill {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-14);
  padding: var(--spacing-7) var(--spacing-7) var(--spacing-7) var(--spacing-29);
  background: var(--color-cream);
  border: 1.5px solid var(--color-ash);
  border-radius: var(--radius-pills);
  animation: pill-enter var(--pill-duration) var(--pill-ease) both;
  transition: border-color 240ms var(--pill-ease);
}

.is-open .site-pill {
  border-color: var(--color-voltage-blue);
}

.site-brand {
  font-size: var(--text-body);
  font-weight: var(--font-weight-light);
  line-height: 1;
  color: var(--color-voltage-blue);
  text-decoration: none;
  white-space: nowrap;
}

/* Hamburger: three hairline bars that fold into an X. */
.site-toggle {
  position: relative;
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--radius-pills);
  cursor: pointer;
  transition: border-color 240ms var(--pill-ease);
}

.site-toggle:hover {
  border-color: var(--color-ash);
}

.site-toggle__bar {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.125rem;
  height: 1.5px;
  background: var(--color-voltage-blue);
  transform: translate(-50%, -50%) translateY(var(--offset, 0));
  transition:
    transform 320ms var(--pill-ease),
    opacity 200ms ease;
}

.site-toggle__bar:nth-child(1) {
  --offset: -0.375rem;
}

.site-toggle__bar:nth-child(3) {
  --offset: 0.375rem;
}

.is-open .site-toggle__bar:nth-child(1) {
  transform: translate(-50%, -50%) rotate(45deg);
}

.is-open .site-toggle__bar:nth-child(2) {
  opacity: 0;
  transform: translate(-50%, -50%) scaleX(0.2);
}

.is-open .site-toggle__bar:nth-child(3) {
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* Flat panel beneath the pill: hairline ash rules, cream surface, no elevation.
   Radius rule (DESIGN.md): interactive pills/buttons are 60px, card-like panels are 0. */
.site-menu {
  position: absolute;
  top: calc(100% + var(--spacing-11));
  right: 0;
  left: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-cream);
  border: 1.5px solid var(--color-ash);
  transform-origin: top center;
}

.site-menu__item + .site-menu__item {
  border-top: 1.5px solid var(--color-ash);
}

.site-menu__link {
  position: relative;
  display: block;
  padding: var(--spacing-14) var(--spacing-29);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-regular);
  line-height: var(--leading-body-sm);
  text-transform: uppercase;
  color: var(--color-voltage-blue);
  text-decoration: none;
  transition:
    padding-left 240ms var(--pill-ease),
    color 160ms ease;
}

.site-menu__link::before {
  content: "";
  position: absolute;
  top: 50%;
  left: var(--spacing-14);
  width: 0.375rem;
  height: 0.375rem;
  border-radius: var(--radius-pills);
  background: var(--color-voltage-blue);
  transform: translateY(-50%) scale(0);
}

.site-menu__link:hover,
.site-menu__link:focus-visible {
  padding-left: var(--spacing-35);
}

.site-menu__link[aria-current="page"]::before {
  transform: translateY(-50%) scale(1);
}

.site-menu__link[aria-current="page"] {
  color: var(--color-ink);
}

/* Panel + staggered rows. */
.site-menu-enter-active,
.site-menu-leave-active {
  transition:
    opacity var(--menu-duration) var(--pill-ease),
    transform var(--menu-duration) var(--pill-ease);
}

.site-menu-enter-from,
.site-menu-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scaleY(0.96);
}

.site-menu-enter-active .site-menu__item {
  transition:
    opacity var(--menu-duration) ease,
    transform var(--menu-duration) var(--pill-ease);
  transition-delay: calc(var(--i) * var(--stagger));
}

.site-menu-enter-from .site-menu__item {
  opacity: 0;
  transform: translateY(-0.375rem);
}

.site-menu-leave-active {
  --menu-duration: 200ms;
}

@keyframes pill-enter {
  from {
    opacity: 0;
    transform: translateY(-0.75rem);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-header {
    --pill-duration: 0ms;
    --menu-duration: 0ms;
    --stagger: 0ms;
  }

  .site-pill,
  .site-toggle,
  .site-toggle__bar,
  .site-menu__link,
  .site-menu__link::before,
  .site-menu-enter-active .site-menu__item {
    animation: none;
    transition: none;
  }
}
</style>
