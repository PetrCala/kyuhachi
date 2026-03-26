Create a new Expo Router screen at the file path given in $ARGUMENTS.

Before creating the file:
1. Read app/app/sign-in.tsx to confirm the current pattern for screens.
2. Read app/src/theme/index.ts to confirm available token exports.

The new file must:
- Be a default-exported React function component named after the last segment of the path (e.g. `OnsenDetail` for `onsen/[id].tsx`)
- Import `SafeAreaView` from `react-native-safe-area-context` as the root element, with `style={styles.container}` and `edges={['top']}` — do not use the built-in RN `SafeAreaView`
- Import only the RN primitives actually used
- Import `{ colors, spacing, typography }` (and `radii`, `shadows` if needed) from the correct relative path to `src/theme`
- Have a `StyleSheet.create()` at the bottom of the file (after the component), never inside the function body
- Include a `container` style: `{ flex: 1, backgroundColor: colors.background }`
- Contain no placeholder comments, no TODO comments, and no unused imports
- Follow strict TypeScript — no implicit `any`

If the path contains a dynamic segment (e.g. `[id]`), read the relevant type from `shared/src/types/` and type the route params using `useLocalSearchParams<{ id: string }>()` from `expo-router`.

Create only the requested file. Do not modify any other file.
