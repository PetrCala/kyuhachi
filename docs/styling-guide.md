# Kyuhachi — Styling Guide

*Audience: anyone writing UI code in this repo, including AI agents.*

---

## Overview

Styling uses plain React Native `StyleSheet.create()` + design tokens from `app/src/theme/`. No component library, no CSS-in-JS, no styled-components.

The token files are the single source of truth for every color, spacing value, font size, border radius, and shadow in the app.

---

## Token files

| File | What it contains |
|---|---|
| `src/theme/colors.ts` | Raw color palette + semantic aliases |
| `src/theme/spacing.ts` | Spacing scale (4pt base grid) |
| `src/theme/typography.ts` | Font sizes and weights |
| `src/theme/radii.ts` | Border radii |
| `src/theme/shadows.ts` | iOS shadow presets |
| `src/theme/index.ts` | Barrel re-export |

**Import** (adjust relative depth for your file location):

```typescript
import { colors, spacing, typography, radii, shadows } from '../src/theme';
```

---

## Token reference

### Colors

```typescript
// Surfaces
colors.background          // #ffffff — primary screen background
colors.backgroundSecondary // #f2f2f7 — grouped lists, inset sections
colors.backgroundElevated  // #fafafa — cards, text inputs

// Text
colors.textPrimary         // #1a1a1a — headings, primary content
colors.textSecondary       // #333333 — supporting text
colors.textTertiary        // #555555 — hints, toggle labels
colors.textMuted           // #888888 — placeholder-level, divider labels
colors.textPlaceholder     // #999999 — TextInput placeholder color
colors.textInverted        // #ffffff — text on dark fills

// Interactive
colors.actionPrimary       // #1a1a1a — primary button fill
colors.actionPrimaryText   // #ffffff — text on primary buttons

// Borders
colors.border              // #dddddd — input borders, card outlines
colors.separator           // #e5e5ea — list dividers
```

### Spacing — 4pt base grid

```
spacing[1]  →  4px   micro: tightly stacked form elements
spacing[2]  →  8px   tight: small padding, compact buttons
spacing[3]  → 12px   form: input inner padding
spacing[4]  → 16px   base: standard margin/padding unit
spacing[5]  → 20px   medium: section padding
spacing[6]  → 24px   large: screen padding (default)
spacing[8]  → 32px   wide: sign-in / full-bleed screen padding
spacing[10] → 40px   xl: large vertical separators
spacing[12] → 48px   hero: title bottom margin
```

### Typography

```typescript
// Sizes
typography.sizes.xs    // 12 — captions, badges
typography.sizes.sm    // 14 — footnotes, secondary labels
typography.sizes.md    // 16 — body text, inputs, primary button labels
typography.sizes.lg    // 17 — standard iOS body (reserved)
typography.sizes.xl    // 20 — section headings
typography.sizes.xxl   // 26 — screen titles
typography.sizes.xxxl  // 28 — hero titles

// Weights
typography.weights.regular   // '400'
typography.weights.medium    // '500'
typography.weights.semibold  // '600'
typography.weights.bold      // '700'
```

### Radii

```typescript
radii.sm    //  6
radii.md    //  8 — buttons, inputs (most common)
radii.lg    // 12
radii.xl    // 16
radii.full  // 9999 — pills
```

### Shadows

Apply via spread: `style={[styles.card, shadows.md]}`

```typescript
shadows.sm  // subtle: list items, small cards
shadows.md  // moderate: modals, popovers
shadows.lg  // prominent: bottom sheets
```

---

## How to style a new screen

```typescript
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../src/theme';

export default function MyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Title</Text>
      <Text style={styles.body}>Body text here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  title: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  body: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
});
```

---

## Rules

1. **No color literals in component files.** Every color references `colors.*`.
2. **No raw spacing numbers.** Every padding/margin uses `spacing[N]`.
3. **No raw `fontSize` or `fontWeight`.** Use `typography.sizes.*` and `typography.weights.*`.
4. **No raw `borderRadius`.** Use `radii.*`.
5. **`StyleSheet.create()` only.** Inline `style={{ ... }}` with literal values is not allowed. The only exception: values computed at runtime (e.g. from layout events or dynamic state).
6. **StyleSheet at the bottom of the file**, after the component export. Never inside the component function.
7. **Each file owns its own stylesheet.** No shared `styles` objects imported across files.
8. **Dark mode is deferred.** No `useColorScheme()`, no light/dark branching. The token structure (palette → semantic aliases) is ready for it when the time comes.

---

## Adding or changing tokens

- Only add tokens used in **2+ places**. One-off values (e.g. `height: 44` for the Apple auth button) can stay as a commented literal.
- When adding a new semantic color, add it to the semantic layer in `colors.ts` — never reach into the raw `palette` from a component file.
- When dark mode is added, add a `darkColors` export to `colors.ts` with the same keys. No other files need to change.

---

## Gotchas

- **`fontWeight` must be a string.** RN requires `'700'`, not `700`. Always use `typography.weights.*` to avoid this.
- **Apple button `cornerRadius` is a prop, not a style.** Use `radii.md` (= 8) to keep it consistent with inputs and buttons.
- **Percentage widths** (`'100%'`) are not spacing tokens — that is fine. Tokens only cover numeric pixel values.
- **`elevation` in shadows** has no visual effect on iOS. It's included for future Android parity; do not remove it.
- **`SafeAreaView`** should wrap screens that sit behind the status bar or home indicator. Its background color must match `colors.background` (or the appropriate surface color).
