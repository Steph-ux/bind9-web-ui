# Contributing

Thanks for helping improve BIND9 Web UI.

## Local Setup

```bash
npm install
npm run check
npm run build
```

For development:

```bash
npm run dev
```

The app uses SQLite by default. Runtime data stays under `data/`, which is ignored by Git.

## Pull Request Guidelines

- Keep changes focused and easy to review.
- Do not commit secrets, real DNS exports, production screenshots, local backups, or generated build output.
- Run `npm run check` before opening a pull request.
- For BIND-facing changes, explain the expected generated config and validation path.
- For UI changes, keep the existing visual direction and avoid adding screenshots with real infrastructure data.

## Issue Guidelines

When reporting a bug, include:

- OS and BIND9 version
- install mode: local BIND host or remote SSH
- database backend: SQLite, PostgreSQL, or MySQL
- relevant sanitized logs
- exact steps to reproduce

