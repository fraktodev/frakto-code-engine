# Contributing to Frakto Code Engine

First off, thank you for considering contributing to this project — your input helps make it better for everyone!

**Frakto Code Engine** is a universal formatter and linter runner for Visual Studio Code.  
It allows you to connect any language, tool, or custom script by piping the editor content through an external process and applying the output back into the file — instantly.

## Philosophy

Every contribution should aim to preserve the clarity, predictability, and maintainability of the transformation pipeline. Code must be written with long-term extensibility in mind, following consistent patterns and strict syntax rules.

---

## Contributing

We welcome community contributions. Whether it's fixing a typo or suggesting a whole new direction, you're invited to help improve this project.

### Bug Reports

If you find an issue with the categorization, a missing property, or any inconsistency, please open a **Bug Report**. Clear examples and context will help us solve it faster.

### Feature Requests

Got an idea to enhance the project? We'd love to hear it. Open a **Feature Request** with a short explanation of your proposal and how it could improve developer experience.

### Pull Requests

Before submitting a pull request, make sure your changes are clear, purposeful, and align with the structure of the project. Always reference the related issue (if any) and explain your reasoning in the PR description. Let’s keep it clean and consistent.

---

## General guidelines

### Emoji Policy

Emojis are strictly prohibited in all code comments, docblocks, commit messages, and documentation.  
They may not be used under any circumstance. Code should remain clean, professional, and timeless.

### Language Policy

All code, comments, docblocks, commit messages, and documentation must be written in English at all times. No exceptions are allowed. Consistency in language ensures clarity and global accessibility.

### Structural Consistency Policy

All functions, classes, objects, and related structures must follow a consistent and uniform pattern throughout the codebase. Do not introduce inconsistencies in naming, formatting, or element ordering between different code fragments or versions.

---

## Syntax guidelines

### TypeScript

- Code must be compatible with **ESM and ES6**.
- Use `camelCase` for all variables, constants, and function names.
- Use `PascalCase` for class names.
- Prefer `const` by default; use `let` only when reassignment is required.
- Avoid `var` entirely.
- Use **arrow functions** for short callbacks and inline functions.
- Use **template literals** instead of string concatenation (`${}`).
- Always terminate statements with a **semicolon (`;`)**.
- Use **strict equality** (`===` / `!==`) at all times.
- Avoid **global variables**. Use closures or modules to encapsulate scope.
- Write **pure, modular functions**, unless mutation is explicitly necessary.

---

## Documentation guidelines

### 1. Purpose of Docblocks

- Every function, mixin, or class **must include a docblock** that is brief, clear, and informative.
- The description **must**:
  - Clearly explain the _final purpose_ of the function or block.
  - Be limited to **one or two lines**, except when documenting a function, class, or foundational structure.
- For **variables, internal functions, or helper logic**, use simple `//` comments only. Do not use formal docblocks.

### 2. @param Rules

- Each parameter must be listed using `@param`, followed by its **variable name**.
- If the parameter is **optional**: The description must **begin with** `Optional.`

### 3. @throws Rules

- Only include it when the function or mixin **may raise an exception or error**.
- Syntax and type formatting must strictly follow the conventions of the language used.

### 4. @returns Rules

- Since TypeScript defines the return type within the function itself, a `@returns` tag should not be included in the docblock.

### 5. Formatting Rules

To ensure structure and readability, apply the following spacing rules:

- There must be **exactly one empty line** (a blank line) between:
  - The description of the docblock and the `@param` section
  - The `@param` section and the `@throw` section
- The entire block must follow the **syntax and conventions** of the language being documented.
- Use indentation and spacing to **align and visually organize** each section.

---

## Frakto coding guidelines

These are just general guidelines. For better contributions, please follow the standards published at [https://github.com/fraktodev/frakto-lint/](https://github.com/fraktodev/frakto-lint/).

---

## License

By contributing your code, you agree to license your contribution under the [MIT License](../LICENSE).
