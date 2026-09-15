# @broke-oclock/ui

Shared Vue UI built on **BootstrapVueNext 1.2.0** and Bootstrap 5. Not React Material UI or shadcn/Tailwind.

```ts
import { BApp, BButton, BFormInput, AppShell } from '@broke-oclock/ui'
import '@broke-oclock/ui/styles.css'
```

The web root wraps its content in `BApp`, as recommended by BootstrapVueNext. Its existing navigation buttons use the real `BButton` router integration. The stylesheet entry loads Bootstrap first, BootstrapVueNext second; app overrides remain in the web app and load last. Do not add Bootstrap's JavaScript bundle alongside Vue-managed components.

Import only needed components through this package's named exports. Add further BootstrapVueNext exports here when used, rather than scattering direct dependency imports across apps or copying the entire library. Keep route definitions, product navigation, page copy, data fetching and account/business state in `apps/web`. The original AppShell is still available at `/app-shell`.

`BApp` must be above components using provider-dependent composables such as useToast/useModal. Do not call them in the same component that declares BApp. See the [official setup guide](https://bootstrap-vue-next.github.io/bootstrap-vue-next/docs).

The consuming app supplies Vue, Vue Router and Bootstrap. Root checks run this package's vue-tsc and existing real-browser navigation/responsive tests. Internal imports use `@ui/*`; consumers use public exports.
