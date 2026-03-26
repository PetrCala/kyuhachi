<!-- Summary in docs/skills.md. Run /update-skills-docs after modifying this file. -->

Enforce the rule from CLAUDE.md: "Do not write any code before the relevant types in shared/src/types/ exist."

Read shared/src/types/ to understand what types currently exist.

Then scan every .ts and .tsx file in app/ and functions/src/ (excluding node_modules) for:

1. **Untyped Firestore data** — any `.data()` call, `DocumentSnapshot`, or collection result cast to `any`, assigned to an untyped variable, or destructured without a type annotation. Each should be typed against a type from shared/src/types/.

2. **Inline type shapes** — any `type` or `interface` defined locally in a component or function file that duplicates or should live in shared/src/types/ (e.g. a locally defined `Onsen` or `Visit` shape).

3. **Missing type coverage** — any Firestore collection path accessed in code (e.g. `firestore().collection('onsens')`) that does not have a corresponding document type in shared/src/types/. List the collection path and the missing type.

4. **`as any` casts** — flag every use of `as any` that touches Firestore data or Firebase Auth user objects.

For each issue: print the file path, line number, and what type should exist or be used.

Then fix what can be fixed by importing from shared/src/types/. If a required type does not exist in shared/src/types/ yet, do not invent it — instead list it clearly as "TYPE MISSING: needs to be added to shared/src/types/ before this code is safe."
