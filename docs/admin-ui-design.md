# Admin UI refinement

## Scope and scene

Mode: Operate. Noah and other administrators use these screens to sign in, review imported drafts, manage account access and inspect operational state, typically in a desktop browser, with mobile access retained. Preserve the map's Lobangers logo, warm paper background, ink colour and sunny-yellow accent, but do not reproduce its floating overlay controls inside a task-oriented workspace.

No auth, API, authorization, optimistic-version or conflict-fence changes. The existing public map keeps its floating header and visual identity.

## Research

- Apple Human Interface Guidelines, Buttons: familiar controls, clear action labels, generous hit regions and a limited number of prominent actions. Apply prominence through style rather than making unrelated controls compete through size. Source: https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple Human Interface Guidelines, Toolbars: avoid crowding the toolbar, keep controls distinguishable and maintain a clear separation between navigation and content. Source: https://developer.apple.com/design/human-interface-guidelines/toolbars
- GitHub Primer, UnderlineNav guidelines: concise route labels, one current destination, alignment with the affected content and no directly stacked navigation bars. Source: https://primer.style/product/components/underline-nav/guidelines/
- GitHub Primer, UnderlineNav accessibility: semantic navigation links, `aria-current`, keyboard operation and visible selection beyond colour alone. Source: https://primer.style/product/components/underline-nav/accessibility/

The Apple Design skill supplies restraint, familiar controls, system typography and immediate state feedback. Impeccable's Operate and Distill playbooks supply the task-first hierarchy, reduced decorative chrome and responsive composition. This is a scoped refinement, not a replacement product brand or a claim of implementing Apple's native UI framework.

## Direction contract

- **Purpose:** Make the current route and next task obvious. No oversized nav pills, repeated brand eyebrow, pastel metric tiles or full-width session card.
- **Navigation:** A normal inline site header in administration, followed by one short-label route row: Overview, Accounts, Ingestion. Use an underline plus heavier text and `aria-current`. Preserve modified-click browser behaviour and the map exit.
- **Hierarchy:** Readable system type for operational headings, labels and data. Yellow fill identifies primary form actions. Secondary controls remain neutral. Session identity and logout are compact; confirmed signed-out visitors do not get a redundant sign-out button.
- **Composition:** Account directory and selected details sit side by side on desktop and stack on narrow screens. Merchant review and audit are separate task groups. Overview puts review work and recent runs before configuration details. Keep genuine content and existing warnings intact.
- **States:** Preserve loading, empty, signed-out, denied, uncertain logout, conflict and retry states. Never treat a visible label or client-side role as permission.

## Verification boundary

Unit regressions cover route selection, SPA navigation, inline-versus-floating header behaviour and absent-session control presentation. The browser matrix checks the original SPA at 320, 768, 1024 and 1440 CSS pixels, including one-row navigation, exact selected state, system type, neutral navigation fill, paper background, visible keyboard focus and document overflow. Existing browser journeys retain exact mutation identity/version assertions and authorization recovery.

Browser API and native identity fixtures are explicitly synthetic. They prove presentation and client transport, not live Google/email delivery or production access. Disposable-database integration checks remain a separate part of the repository gate. No merge, deployment or production writes are included.
