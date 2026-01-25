# Agent Diary: Mintlify Docs Setup

## Task ID
`temporal-orbiting-ladybug`

## Date
2026-01-25

## Objective
Set up `omni-docs` repository at `/Users/scrivner/Documents/GitHub/omni-docs` to power `docs.omnibrief.app` using Mintlify.

---

## Original Plan

1. Install Mintlify CLI globally via `pnpm add -g mint`
2. Create repository directory and init git
3. Create minimal project structure: `docs.json`, `index.mdx`, `quickstart.mdx`, logos, favicon
4. Configure `docs.json` with OMNI branding
5. Test locally with `mint dev`
6. Push to GitHub as public repo under `daniel-scrivner/omni-docs`
7. User connects to Mintlify dashboard manually
8. User configures custom domain and DNS

---

## Execution Deviations

### 1. CLI Installation Method Changed
- **Plan**: `pnpm add -g mint`
- **Actual**: `npm install -g mintlify`
- **Reason**: pnpm global bin directory not configured (`ERR_PNPM_NO_GLOBAL_BIN_DIR`)
- **Lesson**: Fall back to npm for global CLI installs when pnpm global setup is incomplete

### 2. docs.json Navigation Schema Change
- **Plan**: Navigation as direct array
  ```json
  "navigation": [
    { "group": "Getting Started", "pages": ["index", "quickstart"] }
  ]
  ```
- **Actual**: Navigation requires object wrapper with `groups` key
  ```json
  "navigation": {
    "groups": [
      { "group": "Getting Started", "pages": ["index", "quickstart"] }
    ]
  }
  ```
- **Error**: `Invalid type. Expected field to be of type 'object', received 'array'`
- **Lesson**: Mintlify migrated from `mint.json` to `docs.json` with structural changes. Always validate with `mintlify dev` before committing.

### 3. Repository Organization Transfer
- **Plan**: Create repo under `daniel-scrivner/omni-docs`
- **Actual**: User requested transfer to `autonomous-computer` org
- **Method**: Used GitHub API directly: `gh api repos/daniel-scrivner/omni-docs/transfer -f new_owner=autonomous-computer`
- **Note**: `gh repo transfer` doesn't support `--yes` flag. Use API call instead.
- **Post-transfer**: Update local remote with `git remote set-url origin https://github.com/autonomous-computer/omni-docs.git`

---

## Key Technical Details

### Mintlify CLI Commands
| Command | Purpose |
|---------|---------|
| `mintlify dev` | Local preview server |
| `mintlify dev --port 3333` | Custom port (default 3000 often in use) |
| `mintlify validate` | Check build for errors |

### docs.json Required Fields
```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "mint",
  "name": "Project Name",
  "colors": { "primary": "#007AFF" },
  "navigation": { "groups": [...] }
}
```

### Custom Domain Setup (Manual Steps)
1. Mintlify Dashboard → Add custom domain
2. Cloudflare DNS → CNAME `docs` → `cname.mintlify-dns.com`
3. SSL auto-provisions via Let's Encrypt (1-24 hours)

---

## Files Created

| File | Purpose |
|------|---------|
| `docs.json` | Mintlify config with OMNI branding, colors #007AFF/#4DA3FF/#0055CC |
| `index.mdx` | Homepage with CardGroup components |
| `quickstart.mdx` | Getting started guide |
| `favicon.svg` | Placeholder - blue rounded square with "O" |
| `logo/light.svg` | Light mode placeholder |
| `logo/dark.svg` | Dark mode placeholder |
| `.gitignore` | Ignores `node_modules/`, `.mintlify/` |

---

## User Decisions Captured

| Question | Answer |
|----------|--------|
| Repository visibility | Public |
| Initial content scope | Minimal starter |
| Branding assets | Use placeholders |

---

## Final State

- **Repository**: https://github.com/autonomous-computer/omni-docs
- **Branch**: `main`
- **Local path**: `/Users/scrivner/Documents/GitHub/omni-docs`
- **Status**: Clean, up to date with origin

---

## Future Agent Notes

1. **To add new pages**: Add `.mdx` file, then reference in `docs.json` → `navigation.groups[].pages`
2. **To change branding**: Replace SVGs in `/logo/` and `/favicon.svg`
3. **Navigation is NOT auto-discovered**: Every page must be explicitly listed in `docs.json`
4. **Port conflicts**: Use `--port` flag if 3000 is occupied
5. **Schema validation**: Mintlify's `docs.json` schema differs from legacy `mint.json`. Check https://mintlify.com/docs/organize/navigation for current format.
