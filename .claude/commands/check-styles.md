<!-- Summary in docs/skills.md. Run /update-skills-docs after modifying this file. -->

Read CLAUDE.md (specifically the ## Styling section), then audit every .tsx and .ts file in app/ for styling violations. Do not audit files inside app/node_modules/.

Check for each of the following violations:

1. **Color literals** — any hex code, rgb(), rgba(), or named color string (e.g. `'white'`, `'black'`, `'#fff'`) used outside of `app/src/theme/colors.ts`
2. **Raw spacing numbers** — any `padding`, `paddingHorizontal`, `paddingVertical`, `margin`, `marginHorizontal`, `marginVertical`, `marginTop`, `marginBottom`, `marginLeft`, `marginRight`, `gap`, `rowGap`, or `columnGap` value that is a numeric literal instead of `spacing[N]`
3. **Raw font values** — any `fontSize` or `fontWeight` literal not using `typography.sizes.*` or `typography.weights.*`
4. **Raw border radius** — any `borderRadius` numeric literal not using `radii.*`
5. **Inline style literals** — any `style={{ ... }}` containing literal values (runtime-computed values and percentage strings like `'100%'` are acceptable exceptions)
6. **StyleSheet inside component** — any `StyleSheet.create()` declared inside a component function body instead of at module level

For each violation found: print the file path, line number, the offending code, and the correct token to use as a fix.

Then fix every violation. Do not change any logic, markup, or non-style code.

If no violations are found, say so clearly.
