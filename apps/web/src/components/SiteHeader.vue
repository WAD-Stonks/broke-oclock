<script setup lang="ts">
import logoUrl from '@web/assets/logo.png'
import AccountMenu from '@web/components/AccountMenu.vue'
import { SITE_MENU_ID, SITE_NAV_LINKS } from '@web/components/site-nav-links'
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
      <RouterLink class="site-brand" to="/" @click="close">
        <img :src="logoUrl" alt="Lobangers" class="site-logo" />
      </RouterLink>

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
          <li
            class="site-menu__item site-menu__account"
            :style="{ '--i': SITE_NAV_LINKS.length }"
            data-testid="nav-account"
          >
            <AccountMenu />
          </li>
        </ul>
      </Transition>
    </nav>
  </header>
</template>

<style scoped>
/* Floating white card, Google-Maps style: fixed over the page, above Leaflet's controls (z 1000). */
.site-header {
  --card-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --card-duration: 420ms;
  --menu-duration: 360ms;
  --stagger: 40ms;
  position: fixed;
  top: var(--space-5);
  left: var(--space-5);
  z-index: 1100;
  width: min(calc(100% - 2 * var(--space-5)), 22rem);
  font-family: var(--font-sans);
}

.site-pill {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: 4rem;
  padding: 0 var(--space-3) 0 var(--space-6);
  background: var(--paper-white);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  animation: card-enter var(--card-duration) var(--card-ease) both;
}

.site-brand {
  display: flex;
  align-items: center;
  border-radius: var(--radius-control);
}

/* Hamburger: three ink bars that fold into an X. */
.site-toggle {
  position: relative;
  flex: 0 0 auto;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background-color 200ms ease;
}

.site-toggle:hover,
.is-open .site-toggle {
  background: var(--paper);
}

.site-toggle__bar {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.375rem;
  height: 2px;
  background: var(--ink);
  border-radius: 1px;
  transform: translate(-50%, -50%) translateY(var(--offset, 0));
  transition:
    transform 320ms var(--card-ease),
    opacity 200ms ease;
}

.site-toggle__bar:nth-child(1) {
  --offset: -0.4375rem;
}

.site-toggle__bar:nth-child(3) {
  --offset: 0.4375rem;
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

/* Menu card beneath the header: same white surface and radius, rows separated by hairlines. */
.site-menu {
  position: absolute;
  top: calc(100% + var(--space-3));
  right: 0;
  left: 0;
  margin: 0;
  padding: var(--space-2);
  list-style: none;
  background: var(--paper-white);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  transform-origin: top center;
}

/* Account rows come from the shared AccountMenu, so they are styled through its link class. */
.site-menu__account {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--hairline);
}

.site-menu__account :deep(.nav-link) {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
}

.site-menu__link,
.site-menu__account :deep(.nav-link) {
  position: relative;
  display: block;
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-6);
  font-size: var(--text-md);
  font-weight: 500;
  line-height: 1.5;
  color: var(--ink);
  text-decoration: none;
  border-radius: var(--radius-control);
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

/* Coral dot marks the current page. */
.site-menu__link::before,
.site-menu__account :deep(.nav-link)::before {
  content: "";
  position: absolute;
  top: 50%;
  left: var(--space-3);
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--coral);
  transform: translateY(-50%) scale(0);
  transition: transform 200ms var(--card-ease);
}

.site-menu__link:hover,
.site-menu__link:focus-visible,
.site-menu__account :deep(.nav-link:hover),
.site-menu__account :deep(.nav-link:focus-visible) {
  background: var(--paper);
}

.site-menu__link[aria-current="page"],
.site-menu__account :deep(.nav-link[aria-current="page"]) {
  font-weight: 600;
  color: var(--coral);
}

.site-menu__link[aria-current="page"]::before,
.site-menu__account :deep(.nav-link[aria-current="page"])::before {
  transform: translateY(-50%) scale(1);
}

/* Card + staggered rows. */
.site-menu-enter-active,
.site-menu-leave-active {
  transition:
    opacity var(--menu-duration) var(--card-ease),
    transform var(--menu-duration) var(--card-ease);
}

.site-menu-enter-from,
.site-menu-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.97);
}

.site-menu-enter-active .site-menu__item {
  transition:
    opacity var(--menu-duration) ease,
    transform var(--menu-duration) var(--card-ease);
  transition-delay: calc(var(--i) * var(--stagger));
}

.site-menu-enter-from .site-menu__item {
  opacity: 0;
  transform: translateY(-0.375rem);
}

.site-menu-leave-active {
  --menu-duration: 200ms;
}

@keyframes card-enter {
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
    --card-duration: 0ms;
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

.site-logo {
  display: block;
  height: 2rem;
  aspect-ratio: 5.6;
  object-fit: cover;
  object-position: center 48%;
}
</style>
