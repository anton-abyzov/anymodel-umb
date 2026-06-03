# anymodel-umb - Specifications

Feature specifications for **anymodel-umb**.

## Features

Features are organized by ID: `FS-XXX/`

Each feature folder contains:
- `FEATURE.md` - Feature overview and implementation history
- `us-XXX-*.md` - User story files

## Creating Features

Features are automatically created when you sync increments:

```bash
sw:sync-docs
```

Or sync a specific increment:

```bash
sw:sync-docs 0001
```

## Active Features

- [FS-010: Local skill-fidelity: restore skill auto-trigger on local models](FS-010/FEATURE.md)
- [FS-016: Project-scoped local skill index](FS-016/FEATURE.md)

---

Last updated: 2026-04-02
