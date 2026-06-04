# NodePilot

[中文说明 / Chinese README](./README.md)

![NodePilot logo](https://raw.githubusercontent.com/HaoRangQi/NodePilot/master/src/assets/nodepilot-logo.svg?v=20260604-1)

NodePilot is a local desktop Node runtime and project environment manager built on top of `nvm`. It uses `Tauri 2 + React + Vite + TypeScript + Rust` to turn common `nvm-sh/nvm` and `nvm-windows` workflows into a Material You / Material 3 tooling UI.

The first release does not try to replace `nvm`. It focuses on making the existing `nvm` ecosystem easier to inspect, switch, diagnose, and verify from a desktop app.

## Current Status

The first release is code-complete and has an automated verification chain, but final human sign-off is still pending.

| Item | Status |
| --- | --- |
| Frontend shell | Done |
| Rust / Tauri backend | Done |
| `nvm-sh` adapter | Done |
| `nvm-windows` adapter | Done |
| Automated verification | Done |
| macOS / Linux desktop UI manual verification | Pending |
| Windows desktop UI manual verification | Pending |

The only remaining sign-off items are:

- `10.2 Manual macOS/Linux Verification` in [`docs/EXECUTION.md`](./docs/EXECUTION.md)
- `10.3 Manual Windows Verification` in [`docs/EXECUTION.md`](./docs/EXECUTION.md)

Non-blocking follow-up work is tracked in [`docs/PHASE2.md`](./docs/PHASE2.md).

## Product Scope

NodePilot is intentionally scoped to:

- local machine environment management
- `nvm-sh/nvm` and `nvm-windows`
- local Node versions, remote installs, default versions, project `.nvmrc`, diagnostics, and task logs
- a desktop tool with explicit, verifiable behavior

It explicitly does not include:

- accounts
- cloud sync
- telemetry
- commercial entry points
- team management
- Volta, fnm, asdf, Docker, or WSL management

## Core Capabilities

### 1. Environment Overview

- detect backend kind: `nvm-sh`, `nvm-windows`, `missing`, `unsupported`
- show current `Node / npm / pnpm / yarn`
- show Node and npm executable paths
- show platform, architecture, and version source
- show `default` version state and its relation to the active version

### 2. Diagnostics

- missing `nvm`
- installed but not loaded `nvm`
- `PATH` conflicts
- `npm prefix` conflicts
- Apple Silicon legacy Node risk
- Windows admin privilege issues
- Windows legacy Node install conflicts
- `.nvmrc` target version not installed
- `default` pointing to a missing version

### 3. Local Version Management

- list installed local versions
- mark `Current / Default / LTS / System / Missing / Damaged`
- `use`
- `set default`
- `uninstall`
- inspect version details
- copy version string
- open install directory

### 4. Remote Version Management

- fetch remote releases
- filter by `LTS / latest / major / installed / uninstalled`
- install a specific version
- install latest
- install latest LTS
- install latest patch of a major line
- source install for `nvm-sh`
- `arch` selection on Windows
- install logs, cancellation, and write-task mutual exclusion

### 5. Project `.nvmrc`

- read `.nvmrc` from the current folder or parent folders
- validate `.nvmrc`
- check whether the target version is installed
- install the `.nvmrc` target
- apply the `.nvmrc` target
- write or update `.nvmrc`
- persist recent projects locally

### 6. Activity Center

- record read and write tasks
- show `stdout / stderr / exit code / duration`
- distinguish `pending / running / success / failed / cancelled`
- attach repair suggestions to failed tasks
- redact sensitive log content

### 7. Settings

- show backend status
- show shell profile checks
- show mirror / proxy / `default-packages` state
- copy shell integration snippets
- switch `light / dark / system` theme
- switch `Chinese / English` UI language

## Support Matrix

| Capability | macOS / Linux (`nvm-sh`) | Windows (`nvm-windows`) |
| --- | --- | --- |
| backend detect | Yes | Yes |
| local versions | Yes | Yes |
| remote versions | Yes | Yes |
| install | Yes | Yes |
| uninstall | Yes | Yes |
| activate / use | Yes | Yes |
| set default | Yes | Capability-dependent |
| `.nvmrc` read / apply | Yes | Supported as a NodePilot helper flow |
| source install | Yes | No |
| arch selection | Not needed | Yes |
| offline install | Not in v1 | Not in v1 |

## UI Structure

NodePilot ships with 6 primary views:

| View | Purpose |
| --- | --- |
| Home | current environment, health checks, recommended actions |
| Versions | local versions and switching |
| Remote | remote version filtering and installation |
| Projects | `.nvmrc` read, apply, and write flows |
| Activity | task logs, failure summaries, repair actions |
| Settings | backend, shell, theme, and read-only config state |

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Desktop shell | Tauri 2 | windowing, command bridge, packaging |
| Frontend | React + Vite + TypeScript | views, state, interaction, copy |
| Backend | Rust | backend detect, command execution, validation, parsing |
| Runtime adapters | `nvm-sh` / `nvm-windows` | platform-specific behavior |
| Verification | Vitest + Rust tests + local scripts | regression and release checks |

Key constraints:

- the frontend never executes shell commands directly
- backend calls are structured commands, not arbitrary strings
- the backend validates inputs against safe shapes
- logs are redacted by default
- write operations are mutually exclusive; read operations may run in parallel

## Branding and Icons

The repository now uses a unified `NV` monogram logo:

- frontend brand asset: [`src/assets/nodepilot-logo.svg`](./src/assets/nodepilot-logo.svg)
- desktop icon outputs: [`src-tauri/icons`](./src-tauri/icons)

## Prerequisites

### Required to work on this repo

- Node.js
- `pnpm`
- Rust toolchain
- platform dependencies required by Tauri 2

### Recommended runtime environments

- macOS / Linux with `nvm-sh`
- Windows with `nvm-windows`

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the web frontend

```bash
pnpm dev
```

### 3. Start the desktop app in dev mode

```bash
pnpm tauri dev
```

### 4. Build production artifacts

```bash
pnpm build
pnpm tauri build
```

Build outputs are generated under:

- `dist/`
- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm test` | frontend tests |
| `pnpm build` | frontend production build |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust tests |
| `pnpm tauri dev` | desktop dev run |
| `pnpm tauri build` | desktop production build |
| `pnpm verify:all` | release-grade automated verification |
| `pnpm verify:artifacts` | refresh verification artifacts |
| `pnpm verify:release:candidate` | prepare a release candidate bundle |
| `pnpm verify:manual:nvm-sh:prep` | prepare macOS / Linux manual verification |
| `pnpm verify:manual:nvm-windows:prep` | prepare Windows manual verification |

## Verification

### Automated

`pnpm verify:all` runs:

1. `pnpm test`
2. `pnpm build`
3. `cargo test`
4. `pnpm verify:artifacts`
5. `pnpm tauri build`

Latest verification index:

- [`docs/verification/README.md`](./docs/verification/README.md)

The default automated chain includes:

- `pnpm verify:tauri-dev:smoke`
- `pnpm verify:nvm-sh:e2e`
- `pnpm verify:nvm-windows:probe`

### Manual

Manual verification entry points:

- [`docs/manual/README.md`](./docs/manual/README.md)

Execution and checklist status:

- [`docs/EXECUTION.md`](./docs/EXECUTION.md)

Notes:

- automated checks do not replace `10.2 / 10.3` desktop UI manual verification
- `tauri-dev bridge` remains an auxiliary script and is not part of default acceptance evidence

## Release Candidate Flow

To package automated verification plus both manual verification bundles in one pass, run:

```bash
pnpm verify:release:candidate
```

That produces:

- `RELEASE-CANDIDATE.md`
- `RELEASE-CANDIDATE.json`
- macOS / Linux manual verification bundle
- Windows manual verification bundle

## Repository Layout

```text
src/                     React frontend
src/assets/              brand assets and logo
src/shared/              shared frontend types, APIs, Activity, manual bridge
src-tauri/               Tauri / Rust project
src-tauri/src/nvm/       adapters, parser, runner, safety checks
src-tauri/src/tasks/     task model and mutual exclusion
src-tauri/icons/         desktop icon assets
docs/EXECUTION.md        execution checklist and truth source
docs/manual/             manual verification guides
docs/verification/       automated verification artifacts
docs/PHASE2.md           phase-2 items
scripts/                 verification and helper scripts
```

## Current Limitations

- `10.2 / 10.3` manual verification is still pending, so final release sign-off is not yet complete.
- the automated chain covers backend semantics and desktop startup, but not full manual desktop interaction on macOS / Windows
- `offline install` is not implemented in v1
- mirror / proxy editing is not part of v1
- v1 only targets `nvm-sh/nvm` and `nvm-windows`
- on macOS / Linux, `nvm use` only affects task environments launched by NodePilot and does not rewrite already-open terminal sessions
- on Windows, version switching depends on the global symlink and may require administrator privileges

## Phase 2

Follow-up items are tracked in:

- [`docs/PHASE2.md`](./docs/PHASE2.md)

Current phase-2 priorities:

- stabilize `tauri-dev bridge`
- expand desktop UI automation coverage
- capture reusable Windows write-path verification artifacts
- evaluate and implement `offline install`
- add mirror / proxy editing

## Troubleshooting

### `pnpm build` fails

- confirm Node.js and `pnpm` are installed
- reinstall dependencies if the local tree is damaged

### `cargo test` fails

- confirm the Rust toolchain is installed
- confirm `cargo` and `rustup` are available

### `pnpm tauri dev` fails to launch

- confirm Tauri 2 platform dependencies are installed
- confirm the Vite dev server can start correctly

### `nvm-sh` still looks missing after installation

- reopen the shell
- or manually `source` the shell profile, then refresh detection

### `nvm-windows` is still not detected after installation

- reopen PowerShell or Command Prompt
- run `nvm version` manually and confirm it is on `PATH`

### state does not refresh after version switching

- inspect `stdout / stderr / exit code` in Activity
- then check the repair hint plus PATH or privilege diagnostics

## How to File an Issue

This repository does not currently expose a public issue tracker URL in the repo metadata, so use the following minimum structure when reporting work:

1. Confirm the bug is reproducible, or the feature request scope is clearly defined.
2. Include environment details:
   - operating system and version
   - Node.js, `pnpm`, and Rust versions
   - `nvm-sh/nvm` or `nvm-windows` version
   - current NodePilot branch or commit
3. For bugs, include at least:
   - expected result
   - actual result
   - reproduction steps
   - relevant screenshots or logs
   - whether the issue is stable or intermittent
4. For feature requests, include at least:
   - target use case
   - current pain point
   - desired behavior
   - whether the request affects `macOS / Linux`, `Windows`, or both
5. For install, activation, switching, or `.nvmrc` issues, attach:
   - Activity logs
   - whether the relevant item in [`docs/verification/README.md`](./docs/verification/README.md) already passes
   - whether the same problem reproduces in raw CLI `nvm`

Suggested issue template:

```md
Title: one-line problem or request summary

Type: bug / feature / docs / refactor

Environment:
- OS:
- Node.js:
- pnpm:
- Rust:
- nvm:
- NodePilot:

Context:

Reproduction steps / use case:
1.
2.
3.

Expected result:

Actual result:

Extra logs / screenshots:
```

If the repository later adopts GitHub Issues, GitLab Issues, or an internal tracker, add the real entry point here.

## How to Contribute Code

Documentation, tests, bug fixes, and focused feature work are all welcome. The recommended flow is:

1. Open an issue first and align on the problem and scope.
2. Create a branch from the latest mainline. Suggested names:
   - `feat/project-nvmrc-write`
   - `fix/windows-admin-warning`
   - `docs/readme-contribution-guide`
3. Run the baseline checks before editing:

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

4. While editing, keep the current repository constraints intact:
   - the frontend must not execute shell directly
   - the backend only accepts structured command parameters
   - whitelist validation and log redaction must remain in place
   - do not introduce commercialization, accounts, cloud sync, or telemetry into v1 scope
5. Add tests or verification notes for the change:
   - frontend interaction changes: add `Vitest` / `Testing Library` coverage
   - Rust backend changes: add Rust unit tests
   - verification workflow changes: update `scripts/` and `docs/verification/`
6. Before submitting, run:

```bash
pnpm verify:all
```

7. If the change affects manual verification or release boundaries, also update:
   - [`docs/EXECUTION.md`](./docs/EXECUTION.md)
   - [`docs/manual/README.md`](./docs/manual/README.md)
   - [`docs/PHASE2.md`](./docs/PHASE2.md) when the work belongs to phase 2

Recommended contribution shape:

- one change per submission
- small but complete slices
- avoid unrelated refactors
- avoid large formatting-only noise

## Code Contribution: GPT / AI Assistance

Using GPT or other AI tools to assist contributions is allowed, but only under clear constraints:

1. AI-generated content must not be treated as already verified code.
2. Final responsibility stays with the contributor, not the model.
3. Every AI-assisted change must be reviewed, validated, and intentionally accepted by a human before submission.
4. Any change touching command execution, safety validation, path handling, install flow, or privilege detection requires direct human review.
5. Any change touching README, manual verification, or execution docs must be checked against the real code and project state.

Recommended uses of GPT:

- summarize problem context and solution options
- draft tests, docs, or refactor candidates
- assist with reading Rust parser code, Tauri commands, and frontend state flows
- summarize logs, compare regressions, and map verification boundaries

Do not rely on GPT to:

- submit executable code without human verification
- make security decisions for you
- decide whether release work is complete
- turn model output into issue conclusions without checking evidence

If a contribution used GPT assistance, document it in the PR or submission notes:

- what GPT helped with
- what a human reviewed
- which verification commands were actually run

## Related Documents

- [Execution document](./docs/EXECUTION.md)
- [Manual verification guide](./docs/manual/README.md)
- [Verification artifact index](./docs/verification/README.md)
- [Phase 2 plan](./docs/PHASE2.md)
