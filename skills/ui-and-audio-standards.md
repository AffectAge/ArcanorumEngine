# UI and Audio Standards

This skill governs React interface work, Phaser world interaction, reusable UI components, accessibility, visual consistency, and sound. It exists to prevent every feature from inventing its own button, panel, tooltip, spacing, focus behavior, or sound call.

## 1. Non-negotiable UI invariants

- UI is composed from shared primitives and patterns before feature-specific markup is introduced.
- A feature must search the existing component library before creating a new component.
- A visually similar control must reuse the existing component; do not create `ProductionButton`, `DiplomacyButton`, and `ResearchButton` when one configurable `Button` is sufficient.
- Components must receive state and callbacks through props/hooks; they must not read authoritative simulation state directly from Phaser or mutate it.
- React components should remain pure during render. Side effects belong in event handlers, hooks, or services.
- UI state belongs to React/local state or Zustand as defined by `AGENTS.md`; authoritative gameplay state belongs to the server/simulation.
- Every interactive control must have a visible state model: default, hover, focus-visible, pressed/selected, disabled, loading, and error where applicable.
- Keyboard navigation, focus management, accessible names, and semantic HTML are required for menus, dialogs, forms, tabs, lists, and other interactive widgets.
- Sounds are triggered through the central audio service, never by scattering raw Phaser sound keys through feature components.
- New shared components require an example, test, or story showing their supported variants.

## 2. Recommended architecture

```text
feature screen
      ↓
composed patterns (GameWindow, Inspector, ResourceRow, CommandBar)
      ↓
shared primitives (Button, IconButton, Panel, Dialog, Tabs, Tooltip)
      ↓
design tokens (color, type, spacing, radius, motion, z-index)
```

The world renderer is a separate surface:

```text
React UI ── client state/events ── simulation gateway ── server
    │
    └── audio service ── Phaser Sound Manager adapter

Phaser world renderer consumes snapshots/events and sends user intents;
it does not own authoritative gameplay rules.
```

## 3. Library options

The project must not adopt all options at once. Select one UI primitive strategy after inspecting the current dependency graph.

### Option A — Recommended default: internal design system + headless primitives

- React for composition.
- CSS Modules or project CSS with CSS custom properties for tokens.
- A single headless primitive library for difficult interaction patterns:
  - Radix Primitives; or
  - React Aria Components.
- Storybook as an optional development/catalogue tool.
- Phaser Sound Manager for game and UI audio.

Best when the game needs a strong custom visual identity, compact dense panels, tooltips, dialogs, nested menus, and long-term reuse without adopting a generic application theme.

Tradeoff: the project owns visual styling and must maintain the component catalogue.

### Option B — MUI-based system

- React + MUI components and theme tokens.
- MUI handles many common controls, focus states, dialogs, menus, and form patterns.
- Phaser Sound Manager remains the audio layer.

Best when rapid delivery of conventional forms, settings, lists, and dialogs matters more than a highly bespoke visual language.

Tradeoff: the game must actively theme and constrain MUI so screens do not look like unrelated default web applications. Do not mix MUI, Radix, and another full component library for the same control family.

### Option C — Minimal dependency system

- React.
- Native semantic HTML.
- CSS Modules or plain CSS with project-owned tokens.
- Small internal primitives only.
- Phaser Sound Manager for audio.

Best when bundle size, ownership, and long-term control are more important than delivery speed.

Tradeoff: the project must implement and test keyboard behavior, focus management, dialogs, menus, comboboxes, and other complex patterns itself. Use WAI-ARIA APG as the behavior reference rather than inventing interaction rules.

### Selection rule

Option A is the default recommendation for Revival. Option B is acceptable for a conventional application-heavy UI. Option C is acceptable when dependency minimization is a deliberate priority.

Replacing or adding a full UI library requires explicit approval. The proposal must compare bundle cost, accessibility coverage, theming cost, styling model, SSR/browser compatibility if relevant, and migration/maintenance impact.

## 4. Component layers

Use three layers and keep ownership clear.

### Primitives

Small reusable controls with stable APIs:

```text
Button, IconButton, Link, TextInput, Select, Checkbox, Slider,
Tooltip, Popover, Dialog, Tabs, Badge, ProgressBar, Spinner,
Panel, Stack, Inline, Divider, ScrollArea
```

Example:

```tsx
<Button
  variant="primary"
  size="md"
  disabled={isSubmitting}
  onClick={handleConfirm}
>
  Confirm order
</Button>
```

The feature chooses semantic props and content. It does not copy the button's padding, border, focus ring, or sound logic.

### Patterns

Reusable combinations with a domain-neutral purpose:

```text
GameWindow, InspectorPanel, CommandBar, ResourceRow,
EmptyState, ConfirmDialog, FilterBar, MasterDetailLayout
```

Patterns may compose primitives and expose domain-neutral slots/callbacks.

```tsx
<GameWindow
  title="Production"
  actions={<Button variant="secondary">Close</Button>}
>
  <ProductionQueue items={queueItems} />
</GameWindow>
```

### Feature components

Domain-specific screens such as `ProductionScreen` or `DiplomacyScreen`. They compose patterns and primitives. They may contain domain-specific presentation logic, but must not duplicate shared control behavior.

## 5. Reuse protocol for agents

Before creating a UI component:

1. Search `src/ui`, `src/components`, or the repository's established component location.
2. Check whether an existing primitive can express the need through props, slots, variants, or composition.
3. Check whether an existing pattern is close enough to extend.
4. Add a new component only if the responsibility, interaction contract, or visual behavior is genuinely distinct.
5. If adding a shared component, add its variants and usage example to the catalogue and test its interaction states.

Do not create a component solely to rename an existing one. Do not fork a component to change one color or label. Use semantic variants and tokens.

One-off markup is permitted only for static layout or a genuinely unique visual object, and the reason should be clear in code review.

## 6. Design tokens

Centralize visual decisions in semantic tokens. Feature code should consume tokens, not invent arbitrary values.

```css
:root {
  --color-surface-panel: #1b2028;
  --color-content-primary: #f3f5f7;
  --color-action-primary: #c8994e;
  --color-focus-ring: #8fc7ff;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --radius-control: 0.25rem;
}
```

Prefer semantic names (`--color-action-primary`) over component-specific names (`--production-button-gold`). Keep spacing, typography, radii, shadows, motion durations, and z-index layers in the same token system.

### Arcanorum visual direction

The reference style is documented by the examples in `app/client/interface/templates`. These files are a style and interaction reference, not a permission to copy components directly into new features. Agents must extract the visual language and compose new screens from the project's shared primitives.

The reference direction includes:

- black-first surfaces and backgrounds;
- white primary text and icons;
- dense framed panels, clear section grouping, compact toolbars, tabs, lists, tables, tooltips, detail panels, and choice grids;
- restrained borders, inset/panel shadows, deliberate spacing, and reusable frame treatments;
- cut-corner or angular framing where it belongs to the established visual language;
- semantic variants rather than one-off CSS for primary, secondary, selected, success, warning, and danger actions;
- localized labels and accessible names passed into shared components;
- Lucide-style consistent icons and centralized UI sound behavior, as demonstrated by the templates.

Use these semantic tokens as the starting palette:

```css
:root {
  --arc-ui-bg: #000000;
  --arc-ui-text: #ffffff;
  --arc-ui-icon: #ffffff;
  --arc-ui-hover: #00910e;
  --arc-ui-danger: #cc0000;
}
```

Do not hardcode these values in feature components. Map them through theme tokens so states can be adjusted centrally without changing every screen.

### Color and contrast rules

The required colors are semantic roles, not a license to communicate every state through color alone:

- `#000000` is the primary background/surface base.
- `#FFFFFF` is the default text and icon color.
- `#00910E` is the hover/active accent. Use it for borders, outlines, indicators, or text on black. If it is used as a filled control background, verify the foreground color and focus state separately.
- `#CC0000` is the danger accent for destructive actions, close/delete/cancel emphasis, errors, and danger borders. Do not use small red text on black as the only error signal; use a stronger surface/border treatment and an additional icon or message.

Approximate contrast ratios against the requested palette are:

| Foreground | Background | Ratio | Use |
|---|---:|---:|---|
| White | Black | 21.00:1 | primary text/icons |
| Green `#00910E` | Black | 5.06:1 | hover/active text, borders, accents |
| Red `#CC0000` | Black | 3.57:1 | non-text danger indicator, large accent, border |
| White | Red `#CC0000` | 5.89:1 | danger button text |

For normal text, target at least 4.5:1; for large text, at least 3:1. Meaningful icons and UI component boundaries should reach at least 3:1 against adjacent colors. Because `#CC0000` on black does not meet normal-text contrast, use white text on a red danger surface or add a stronger non-color cue. Test actual rendered gradients, opacity, shadows, and hover states rather than relying only on token values.

### Reference-template workflow

When implementing a screen, inspect the nearest examples first:

1. Use `DEMO_ELEMENTS.md` to identify the intended pattern category.
2. Inspect the existing template source for composition, density, frame treatment, state handling, motion, and accessibility behavior.
3. Reuse the project's shared primitive/pattern API or extend its owner.
4. Do not import a template component merely because its name is convenient, and do not duplicate its CSS into a feature.
5. If the pattern is genuinely missing, add it to the shared component layer, export it from the component index, document it, and add a gallery/example state.

The templates are especially useful as references for `AppButton`, `AppForm`, `AppModal`, `AppMotion`, `AppSurface`, `AppTable`, `GameActionBar`, `GameFramePanel`, `GameTabs`, `GameScrollList`, `GameChoiceModal`, `GameDetailPanel`, `GameNotificationList`, and `GameTooltipCard`. They remain examples of the desired approach; the agent must preserve reuse rather than create direct copies.

## 7. Accessibility and interaction

Use native HTML semantics first. Use ARIA only to express the semantics and states that native HTML cannot provide. Every icon-only button needs an accessible name. Dialogs need focus entry, keyboard escape behavior where appropriate, and focus restoration. Menus, tabs, listboxes, comboboxes, and tree views must follow the corresponding WAI-ARIA Authoring Practices pattern.

```tsx
<button
  type="button"
  aria-label="Close production window"
  onClick={onClose}
>
  <CloseIcon aria-hidden="true" />
</button>
```

Do not use a clickable `div` where a button or link is semantically correct. Do not remove focus outlines without providing an equivalent `:focus-visible` style.

## 8. Component API rules

- Prefer explicit semantic variants over arbitrary style escape hatches.
- Prefer `children` and named slots for composition over large configuration objects.
- Keep controlled/uncontrolled behavior explicit for inputs and overlays.
- Use `disabled` for unavailable controls; explain why through visible text or an accessible description when needed.
- Avoid boolean prop explosions such as `large`, `dark`, `outlined`, `compact`, `danger`, and `flat` when a typed `variant` or `size` is clearer.

```ts
type ButtonProps = {
  readonly variant?: "primary" | "secondary" | "danger" | "ghost";
  readonly size?: "sm" | "md" | "lg";
  readonly loading?: boolean;
  readonly children: React.ReactNode;
};
```

## 9. Animation and motion

Animation is a reusable interaction and communication system, not a collection of ad hoc delays. The agent must use existing motion presets before inventing a new duration or easing curve.

### Ownership

- CSS transitions/keyframes are the default for React DOM state changes such as hover, focus, expand/collapse, opacity, and panel entry.
- React logic controls state and lifecycle; it must not perform imperative animation work during render.
- Phaser Tweens are the default for world objects, camera movement, sprites, particles, map feedback, and game-scene effects.
- Authoritative simulation never depends on animation completion, frame rate, render timing, or tween callbacks.
- Animation may visualize a simulation event, but an animation must not decide gameplay state.

### Motion tokens and presets

Centralize durations, easings, and transitions:

```css
:root {
  --motion-fast: 120ms;
  --motion-normal: 180ms;
  --motion-slow: 280ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.2, 0.8, 0.2, 1);
}

.panel {
  transition:
    opacity var(--motion-normal) var(--ease-standard),
    transform var(--motion-normal) var(--ease-standard);
}
```

Use semantic presets such as `fade`, `panel-enter`, `menu-open`, `selection-pulse`, and `camera-pan`. Do not scatter raw `300ms`, `ease-in-out`, or custom keyframes through feature files.

### Reuse and lifecycle

Create a shared motion primitive or hook when the behavior is reused:

```tsx
<AnimatedPresence preset="panel-enter">
  {isOpen && <GameWindow title={title}>{children}</GameWindow>}
</AnimatedPresence>
```

For Phaser, use a project animation helper or preset:

```ts
playTween(scene, "unit-selection", unitSprite);
```

Every animation must have a clear owner and cleanup path. Stop or destroy looping tweens, particles, timers, and listeners when the component/scene unmounts or changes ownership. Do not create a new tween on every React render.

### Reduced motion and accessibility

Honor `prefers-reduced-motion: reduce` and the in-game reduced-motion setting. Replace non-essential movement with opacity, color, outline, or an immediate state change. Do not remove essential state communication; provide a non-motion cue.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

Avoid continuous flashing, large-scale zooms, aggressive camera shake, and parallax that is not necessary to understand the game. Test reduced motion in both DOM UI and Phaser scenes.

## 10. Icons and visual assets

Icons are part of the design system. Agents must use the existing icon registry or approved icon set before drawing a new SVG or importing an arbitrary icon package.

### Icon options

- **Recommended:** one consistent SVG icon set, wrapped by a project `Icon` component and mapped through semantic names.
- **Custom game symbols:** project-owned SVG/texture assets stored in an asset manifest and referenced by stable semantic IDs.
- **Icon library:** choose one library such as Lucide, Material Symbols, or another approved set; do not mix visual families without an explicit design decision.

The game may use custom illustrated assets for terrain, resources, units, and historical symbols, but UI controls should still use a consistent stroke/fill, optical size, and alignment system.

### Icon registry

Do not scatter file paths or raw SVG markup through feature components.

```ts
export type IconName =
  | "close"
  | "search"
  | "settings"
  | "production"
  | "diplomacy"
  | "warning";

<Icon name="production" size="md" label={t("ui.production.title")} />
```

The registry owns the component/asset mapping, default size, stroke/fill policy, and decorative-versus-meaningful behavior. Adding an icon requires checking whether an existing icon communicates the same concept.

### Accessibility

- Decorative icons use `aria-hidden="true"` and must not be focusable.
- Icon-only buttons must have a localized accessible name.
- Meaningful standalone SVGs need an accessible name via a label/title or equivalent.
- Never communicate a state by color alone; pair icons with text, shape, pattern, tooltip, or accessible state.
- Do not put translated text inside an SVG or texture unless the asset pipeline explicitly supports locale variants.

```tsx
<IconButton
  icon="close"
  aria-label={t("common.close")}
  onClick={onClose}
 />
```

### Asset rules

- Every required icon/texture must be declared in the asset manifest and fail explicitly when missing.
- Do not silently substitute a placeholder icon or fallback texture.
- Keep source assets separate from generated atlases/spritesheets.
- Use stable semantic asset IDs; physical filenames may change behind the manifest.
- Prefer SVG for scalable DOM UI icons and raster/atlas assets for Phaser art where that is appropriate.
- Check contrast, legibility at intended sizes, pixel density, and color-blind distinguishability.

## 11. Localization and internationalization

Localization is a cross-cutting UI requirement, not a final translation pass. Every user-visible string must be designed so that its wording, length, plural rules, number format, date format, direction, and accessible name can vary by locale.

### Localization options

Choose one message/localization runtime for the client. Do not mix i18next and React Intl for the same messages.

#### Option A — Recommended for content-heavy modding: i18next

Use i18next when locale resources are loaded as JSON, content and mods may provide translations, namespaces are useful, and runtime language switching is important. Keep interpolation escaped by default and use its plural/context support rather than concatenating fragments.

#### Option B — Recommended for ICU-first UI: FormatJS / React Intl

Use React Intl when ICU MessageFormat, typed message descriptors, locale-sensitive number/date formatting, and translator-friendly complete messages are the primary concerns.

#### Option C — Minimal platform layer

Use `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.ListFormat`, `Intl.RelativeTimeFormat`, and a small project-owned message loader. This minimizes dependencies but requires the project to implement resource loading, plural/message selection, diagnostics, and extraction rules.

The default recommendation for Revival is Option A if modders must author localization files alongside JSON gameplay content. Option B is equally valid if the client UI is managed centrally and ICU tooling is preferred. Selecting or replacing the library requires explicit approval.

### Translation keys

Use stable semantic keys, not English source text and not layout/component names.

```json
{
  "ui.production.confirmOrder": "Confirm production order",
  "ui.production.queue.items": "{count, plural, =0 {No items} one {# item} other {# items}}",
  "game.goods.coal.name": "Coal"
}
```

```tsx
<Button aria-label={t("ui.production.confirmOrder")}>
  {t("ui.production.confirmOrder")}
</Button>
```

Do not write:

```tsx
// Do not concatenate fragments: grammar and word order vary by language.
`${count} ${count === 1 ? "item" : "items"}`;
```

Use a complete translatable message with plural/select rules instead:

```tsx
<FormattedMessage
  id="ui.production.queue.items"
  values={{ count }}
/>
```

Do not use rule IDs, entity IDs, asset keys, or localization keys as user-facing text. Stable IDs are references; localized names are content.

### Formatting rules

- Keep numbers, dates, times, currencies, units, and percentages as typed values until the presentation boundary.
- Format them with locale-sensitive `Intl`/ICU APIs, not `toFixed`, string concatenation, or hand-written locale branches.
- Keep plural/select logic inside one complete message so translators can reorder the sentence.
- Do not parse localized display strings back into gameplay values.
- Do not put localized strings into authoritative simulation state; store stable IDs and numeric values instead.

```ts
const formatter = new Intl.NumberFormat(locale, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const displayedPopulation = formatter.format(population);
```

### Missing translations and validation

Translation resources are external content and must be validated. Missing required keys, invalid message syntax, unsupported placeholders, and duplicate keys must produce diagnostics with locale, file, namespace, and key.

Do not silently fall back to English or to a key in production. A fallback is permitted only when explicitly documented for an optional/in-development resource and must remain visible in diagnostics. Required localization failures stop the affected load path, consistent with `AGENTS.md`.

Translation interpolation must escape untrusted values by default. Never disable escaping for user-provided input unless the content is intentionally trusted and the boundary is documented.

### Layout, RTL, and accessibility

- Set the document/app language and direction from the active locale (`lang` and `dir`).
- Use CSS logical properties (`margin-inline`, `padding-block`, `inset-inline-start`) instead of assuming left-to-right layout.
- Test long German/Finnish/Russian strings, compact CJK text, and Arabic/Hebrew RTL layouts.
- Do not bake text into images, icons, textures, or Phaser sprites when it must be translated.
- Accessible names, tooltips, error messages, and screen-reader-only text must use the same localization pipeline as visible text.
- Never rely on color alone to communicate a localized state.
- Reserve enough space for translated labels; avoid truncating critical actions without a tooltip or accessible name.

### Localization and reusable components

Shared primitives must accept localized content through `children`, labels, descriptions, and slots. They must not contain feature-specific English strings.

```tsx
<Dialog
  title={t("ui.production.confirm.title")}
  description={t("ui.production.confirm.description")}
  confirmLabel={t("common.confirm")}
  cancelLabel={t("common.cancel")}
  onConfirm={onConfirm}
  onCancel={onCancel}
/>
```

This keeps `Dialog` reusable across production, diplomacy, research, and settings screens.

### Localization verification

Verify at minimum:

- every required key exists in the base locale;
- all supported locales parse successfully;
- placeholders match between locales;
- plural/select branches are covered;
- long strings do not break important layouts;
- RTL direction and keyboard navigation work;
- locale-sensitive numbers and dates render correctly;
- screenshots or browser checks cover representative locales;
- missing keys fail visibly in development and fail the relevant validation/load check in production.

## 12. Audio architecture

Phaser's built-in Sound Manager is the default audio implementation. It supports global volume/mute/rate controls, lifecycle handling, Web Audio/HTML5 Audio selection, and audio sprites. Keep it behind a project-owned interface so React components and simulation code do not depend on Phaser types.

```ts
export type UiSound =
  | "buttonHover"
  | "buttonConfirm"
  | "buttonCancel"
  | "windowOpen"
  | "error"
  | "notification";

export interface AudioService {
  playUi(sound: UiSound): void;
  playMusic(track: string): void;
  setBusVolume(bus: "ui" | "music" | "effects", volume: number): void;
  setMuted(muted: boolean): void;
}
```

The Phaser adapter owns actual asset keys, audio sprites, looping, cleanup, volume buses, and browser unlock behavior.

```ts
export class PhaserAudioService implements AudioService {
  constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {}

  playUi(sound: UiSound): void {
    this.sound.play("ui-audio", { marker: sound, volume: 0.7 });
  }

  setMuted(muted: boolean): void {
    this.sound.mute = muted;
  }
}
```

Rules:

- Feature components call `audio.playUi("buttonConfirm")`, not `phaser.sound.play("click_03")`.
- Sound names are semantic and stable; physical asset keys stay in the adapter/manifest.
- UI sound policy is centralized: hover sounds are optional and rate-limited; confirmation/cancel/error sounds are consistent across screens.
- Music, UI, world effects, and ambience use separate volume buses.
- Audio must respect mute, volume settings, focus/lifecycle handling, and browser user-gesture unlock.
- Do not add a new sound file for every button. Reuse a small semantic sound vocabulary and use audio sprites where appropriate.
- Simulation must never play sound directly. It emits events; the client decides whether and how to present them.

## 13. Audio alternatives

### Phaser Sound Manager — default

Use when audio is part of the Phaser game, including music, UI feedback, world effects, and spatial audio. This avoids a second audio runtime.

### Howler.js — conditional alternative

Use only if the project needs an audio system independent of Phaser, such as a separate React shell, non-Phaser scenes, or a requirement Phaser cannot satisfy. Adding Howler alongside Phaser requires explicit approval and a clear ownership boundary; do not let both systems control the same bus.

### Web Audio API — specialized use

Use directly only for custom DSP, procedural synthesis, or analysis that the selected audio layer cannot provide. Hide it behind `AudioService`; do not expose `AudioContext` to feature components.

## 14. Verification

Shared UI primitives must have:

- tests for keyboard and pointer behavior where applicable;
- tests for disabled/loading/error states;
- an accessible name/state check;
- visual examples for each supported variant;
- a browser smoke test for dialogs, menus, tabs, and focus restoration when changed.

Animation changes must verify:

- the chosen motion preset and its ownership;
- cleanup on unmount, scene change, and repeated triggering;
- no gameplay decision depends on animation timing;
- reduced-motion behavior in DOM and Phaser surfaces;
- no excessive flashing, camera shake, or continuous motion without a user need.

Icon and asset changes must verify:

- reuse/search of the existing registry before adding an asset;
- accessible names for meaningful/icon-only controls;
- `aria-hidden` behavior for decorative icons;
- contrast and legibility at intended sizes;
- manifest validation and explicit failure for missing required assets;
- no unintended locale-specific text baked into a shared asset.

Audio changes must verify:

- semantic sound routing;
- mute and volume buses;
- no duplicate playback from rerenders;
- cleanup of looping music/effects;
- behavior before and after browser audio unlock.

## Official references and accepted standards

- [React: Your First Component](https://react.dev/learn/your-first-component)
- [React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React: Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [W3C WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [Phaser 4 Tweens](https://docs.phaser.io/phaser/concepts/tweens)
- [W3C Design System: SVG Icons](https://design-system.w3.org/styles/svg-icons.html)
- [W3C Language Tags and Locale Identifiers](https://www.w3.org/TR/ltli/)
- [Unicode ICU Message Formatting](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [Unicode ICU Internationalization](https://unicode-org.github.io/icu/userguide/icu/i18n.html)
- [i18next Interpolation](https://www.i18next.com/translation-function/interpolation)
- [React Intl / FormatJS](https://formatjs.github.io/docs/react-intl/)
- [Phaser 4 Audio](https://docs.phaser.io/phaser/concepts/audio)
- [Phaser 4 BaseSoundManager](https://docs.phaser.io/api-documentation/4.0.0/class/sound-basesoundmanager)
- [Radix Primitives](https://www.radix-ui.com/primitives)
- [React Aria Components](https://react-spectrum.adobe.com/react-aria/components.html)
- [MUI](https://mui.com/material-ui/getting-started/)
- [Storybook: Design Systems](https://storybook.js.org/tutorials/design-systems-for-developers/)
