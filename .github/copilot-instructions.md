<!-- Copilinstructionsons for AI coding agents working on this repo -->
# Copilot Instructions — ANTAM-PROJECT

Purpose: give an AI coding agent immediate, actionable context to work safely and productively in this repository.

Big picture
- This is a Node.js CLI automation tool that uses Playwright (and Playwright Extra) to run two kinds of actions: API-hybrid automation and browser automation. The CLI entrypoint is `main.js` which drives user flows and invokes functions in `src/core/*`, `src/auth/*`, and `src/data/*`.
- Key runtime behavior is driven by the interactive menu in `main.js` (menu options 1..8, T, 0). Many features are triggered from these menu choices (e.g., `startSniperMode`, `startSniperAPI`, `startMultiSniper`, `startAutoMonitor`).

Key files & patterns (use these as primary references)
- `main.js` — top-level CLI; shows how accounts are loaded, how branch IDs are validated (`config/config.js`'s `secretMap`) and how modes (api vs browser) are chosen.
- `config/config.js` — contains `secretMap`, `siteKeys`, `proxyConfig`, and helper `getSiteName`. Branch IDs and tokens live here and are used across the codebase for validation and display.
- `src/core/` — core action implementations: `sniper.js`, `sniperAPI.js`, `multiSniper.js`, `war.js`, `autoMonitor.js`. Follow these when changing automation logic.
- `src/auth/auth.js` and `src/auth/sessionGuard.js` — authentication and session protection logic; edits here affect account login flows.
- `src/data/accountManager.js` and `src/data/settings.js` — persistence of accounts and settings (used by `main.js` and core modules).
- `src/utils/` — small helpers: `proxyTester.js` (proxy test flow invoked with menu 'T'), `solver.js`, `telegram.js` (integrations).

Run / build / debug
- Install: `npm install`
- Start CLI: `npm start` (runs `node main.js`). The interactive UI uses `inquirer`.
- Clean session artifacts: `npm run clean` (removes `session/*` and `screenshots/*`).
- There is no test suite; `npm test` is a placeholder.
- When making runtime changes, run `npm start` and use the interactive menu to exercise flows (e.g., add account, start sniper, test proxy). Use menu `T` to trigger `testProxy()` quickly.

Project-specific conventions
- CLI-first: prefer preserving the interactive menu flow in `main.js` when changing behavior — most contributors expect changes to be exercised through the same menu paths.
- Branch IDs are validated against `secretMap` in `config/config.js`. Do not remove or rename `secretMap` without updating callers (e.g., `main.js` input validation and `sniper*` modules).
- Sessions and runtime artifacts are stored under `session/` and `screenshots/`. The `clean` script assumes these locations.
- Playwright runs are configurable via `src/data/settings.js` values (e.g., `headless`, `useProxy`, `checkInterval`). Search for `loadSettings()`/`manageSettings()` to locate these flows.

Integration points & external dependencies
- Playwright + `playwright-extra` + `puppeteer-extra-plugin-stealth` — affects how browsers are launched and stealth behavior is applied. See `package.json` deps.
- HTTP calls use `axios` in several core modules (hybrid API flows). Inspect `sniperAPI.js` and `war.js` for API behavior.
- Proxy configuration is read from environment variables (see `config/config.js`) and is tested via `src/utils/proxyTester.js`.

Editing rules for AI agents
- Keep changes minimal and local: prefer small, testable edits. Run `npm start` locally to manually verify interactive flows you touch.
- Preserve `secretMap` keys and `getSiteName()` output format unless you update all call sites.
- If you modify CLI prompts or menu indices in `main.js`, update any code that parses user input (validate/parse logic and default values).
- When adding new settings, store defaults in `src/data/settings.js` and expose them through `manageSettings()` so the CLI can change them.
- Do not commit secrets. `config/config.js` currently exports sensitive tokens — avoid adding real secrets in commits; prefer `.env` or instruct maintainers to populate `config/config.js` from examples.

Examples (copyable patterns)
- Validate branch input against `secretMap`: `if (!secretMap[val]) throw new Error('ID Cabang tidak valid')`
- Load accounts before actions: `const accounts = loadAccounts(); if (accounts.length === 0) { console.log('No accounts'); }`
- Trigger API sniper flow: `await startSniperAPI(account, branchId)` (see `main.js` case "3" for usage)

Where to look next (for feature work)
- Authentication flows: `src/auth/*` and `src/data/accountManager.js`
- Automation strategies: `src/core/sniper.js` (browser) vs `src/core/sniperAPI.js` (API hybrid)
- Multi-account coordination: `src/core/multiSniper.js`

If anything is ambiguous, ask for:
- Expected behavior for a specific menu option (copy the menu number and the input flow) so tests can be run via the CLI.
- Clarification about any secret/token changes in `config/config.js`.

---
If you want, I can: run the CLI and exercise a specific menu flow, or add brief unit tests scaffolding for a module you plan to change.
