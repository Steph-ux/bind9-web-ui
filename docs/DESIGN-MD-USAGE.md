# DESIGN.md Library

Local reference repo:

- `docs/awesome-design-md`

Main collection folder:

- `docs/awesome-design-md/design-md`

How we use it in this project:

1. Pick a design source from `docs/awesome-design-md/design-md/<brand>/DESIGN.md`
2. Copy or adapt that file into the project root as `DESIGN.md` when we want to steer the UI
3. Tell the coding agent which visual direction to follow for the next refactor

Useful candidates for `Bind-Config`:

- `linear` for dense admin UI with strong hierarchy
- `mintlify` for docs-oriented clean layouts
- `vercel` for precise developer tooling aesthetics
- `ibm` for structured enterprise dashboards
- `claude` for softer editorial product surfaces

Recommended workflow:

- Keep the full library in `docs/awesome-design-md`
- Create only one active `DESIGN.md` at project root when we want to drive a concrete redesign pass
- Replace that root file whenever we intentionally change visual direction
