# UI Template Demo Elements

These files are a reference for Arcanorum's desired visual language, composition, density, states, and interaction patterns. They are not a command to copy a template directly into a feature. Agents must first search the current shared component owner, then compose or extend reusable primitives and patterns. Use a template component directly only when it is already the established owner for the responsibility.

## Layout And Frames

- `GameActionBar` - top command bar with title, leading icon, and right-side actions.
- `GameFramePanel` - reusable dark cut-corner framed panel for auth, modal sections, and grouped content.
- `GameTabs` - cut-corner tab strip for modal steps or grouped views.
- `GameScrollList` - styled vertical list with reusable row framing and system scrollbar behavior.
- `AppModal` - reusable modal shell with backdrop, animation, and modal panel.
- `AppModalHeader` - reusable modal header with title, optional description/actions, and close button.
- `AppToolbar` - compact toolbar surface for grouped controls.
- `AppSection` - reusable section container for modal content.
- `AppCard` - compact card surface for repeated or grouped content inside a modal.

## Modal Choice Patterns

- `GameChoiceModal` - full choice modal pattern with header, close button, choice grid, and actions.
- `GameChoiceGrid` - reusable selectable card grid for identities, dedications, races, cultures, religions, and similar choices.
- `GameChoiceItem` - data shape for a choice card: title, description, icon, accent color, effects, disabled state.

## Buttons

- `AppButton variant="primary"` - main positive action button.
- `AppButton variant="secondary"` - neutral secondary action button.
- `AppButton variant="danger"` - destructive or dangerous action button.
- `AppButton variant="ghost"` - low-emphasis action button.
- `AppButton variant="success"` - positive state/action button when success needs a separate tone.
- `AppButton variant="warning"` - warning state/action button.
- `AppButton variant="selected"` - selected action state.
- `AppButton size="xs"` - compact inline button.
- `AppButton size="sm"` - small toolbar button.
- `AppButton size="md"` - default button.
- `AppButton size="lg"` - large modal action button.
- `AppButton size="icon"` - icon-only button; always provide `aria-label`.

## Forms And Inputs

- `AppField` - label, hint, and error wrapper for lower-level form controls.
- `AppInput` - low-level input control when `GameTextField` is not flexible enough.
- `AppTextarea` - low-level textarea control when `GameTextField multiline` is not flexible enough.
- `AppToggle` - reusable toggle/switch for binary settings.
- `GameSwitch` - atomic cut-corner on/off switch without label or description layout.
- `GameTextField` - reusable text input with label, error state, and cut-corner field frame.
- `GameTextField multiline` - textarea version for descriptions and notes.
- `GameSelectField` - reusable native select field in the same cut-corner input style.
- `GameDropdownField` - reusable custom dropdown/listbox in the same cut-corner input style, for game-styled selections such as country lists.
- `GameColorPickerButton` - one-button color picker with color swatch and optional value display.
- `GameImageUploadCard` - image upload/preview card for flags, crests, logos, emblems, and similar assets.

## Preview And Identity Chips

- `GamePreviewChip` - small cut-corner preview chip for a color, image, icon, or empty placeholder.
- `GamePreviewChipGroup` - combined preview chip row, usually color plus logo/image.

## Status And Toggles

- `AppStatusChip tone="active"` - active state chip.
- `AppStatusChip tone="pending"` - pending/waiting state chip.
- `AppStatusChip tone="available"` - available state chip.
- `AppStatusChip tone="unavailable"` - unavailable/error state chip.
- `AppStatusChip tone="locked"` - locked state chip.
- `AppEmptyState` - reusable empty-state surface with optional icon and action.
- `AppSectionHeader` - reusable section header with title, description, icon, and actions.

## Detail And Side Panels

- `GameDetailPanel` - right-side detail card with icon, title, description, sections, rows, favorite action, and footer.
- `GameResourcePanel` - compact resource/value list panel.
- `GameNotificationList` - notification list with dismiss buttons and optional show-all action.
- `GameTooltip` - simple hover/focus tooltip wrapper for buttons, icons, fields, and other interface elements.
- `GameTooltipCard` - tooltip-style explanation card with eyebrow, title, description, rows, and pin hint.
- `GamePlotTooltipCard` - Civ-style map/plot tooltip with a unified `data` API for geography-first terrain/surface rows, ownership, movement explanation, resources, systems, units, optional map tag groups, and empty states.
- `GamePlotTooltipPositioner` - fixed-position wrapper for hover/pinned plot tooltips that keeps the card inside the viewport around a cursor or map anchor point.

## Data And Progress Views

- `GameChartPreview` - ECharts-based chart preview. Use `type="line"`, `type="bar"`, `type="area"`, or `type="donut"`.
- `GameTechTreePreview` - reusable technology/progression node preview.
- `AppTableShell` - styled scroll shell for tabular data.
- `AppTable` - reusable table element.
- `AppHeadCell` - reusable table header cell.
- `AppCell` - reusable table body cell.
- `EventStoryModal` - story/event modal pattern for decisions and event options.
- `AppMotion` - shared animation helpers for app-level UI transitions.

## Demo-Only Container

- `GameTemplateGallery` - demo page that shows the UI system. Do not use it inside gameplay modals.

## Usage Rules

- All visible text must come from the project's localization source with supported locale values.
- Use the existing shared component owner where it matches the responsibility; do not import a template merely because its name is convenient.
- Do not copy template markup or CSS into a feature screen.
- When adding a reusable UI component, add it under the established shared component location, export it from its index, and update this document in the same change.
- If the component has a visual state that should guide future modal work, add or update an example in `GameTemplateGallery`.
- Keep colors, borders, shadows, and cut corners on theme tokens and existing component props/classes.
- Do not create one-off modal CSS when an element above already matches the need.
- For icon-only actions, use a Lucide icon and a localized `aria-label`.
- For charts, use `GameChartPreview`/ECharts patterns rather than hand-drawn charts.
