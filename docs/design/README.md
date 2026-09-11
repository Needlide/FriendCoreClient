# FriendCore Design Documentation

Design specs for the FriendCore web client (Angular v22, custom CSS, code-first tokens).

## Decisions (locked in)

| Decision | Choice |
|---|---|
| Framework | **Angular v22** |
| Styling | **Custom-only** (SCSS + CSS custom properties) |
| Token source of truth | **Code** — [`src/styles.scss`](../../src/styles.scss) |
| Figma sync | **Manual mirror** — no automated token pipeline for MVP |

## Workflow

```
src/styles.scss  →  design-system.md  →  Figma Variables  →  Screens  →  Dev Mode  →  Angular
     ↑ source of truth              manual 1:1 copy              handoff        var(--fc-*)
```

When a token value changes: **code first**, then `design-system.md`, then Figma.

## Documents

| Doc | Purpose |
|---|---|
| [`design-system.md`](design-system.md) | Token contract (colors, type, space, radius, shadow, motion), breakpoints, a11y hooks |
| [`figma-guide.md`](figma-guide.md) | Step-by-step Figma file setup for newcomers |
| [`components.md`](components.md) | Component kit inventory, variants, accessibility requirements |
| [`screens.md`](screens.md) | Screen & flow inventory tied to API endpoints and required states |
| [`content-and-a11y.md`](content-and-a11y.md) | Voice, microcopy, error copy, WCAG 2.2 + COGA checklists |

## Related

- [`../ui-design-plan.md`](../ui-design-plan.md) — product UI direction, philosophy, build order
- [`../../src/styles.scss`](../../src/styles.scss) — live token implementation
- API integration guide — auth, SignalR, error shapes (in the API repo / `claude.md`)

## Getting started

1. Read [`design-system.md`](design-system.md) to understand the token contract.
2. Follow [`figma-guide.md`](figma-guide.md) to create the Figma file (Foundations → Components → Screens).
3. Use [`screens.md`](screens.md) as the screen checklist; [`components.md`](components.md) for the kit.
4. Validate copy and accessibility with [`content-and-a11y.md`](content-and-a11y.md) before marking a screen done.
5. Implement in Angular using `var(--fc-*)` — never hard-code hex from Figma without adding a token first.
