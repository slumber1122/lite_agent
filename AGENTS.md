AGENTS.md
This document defines how agents (OpenCode-style tasks, AI-assisted edits, and code transformations) should operate within this repository.

1) Goals and scope
- Provide a predictable, repeatable workflow for building, testing, linting, and extending the codebase.
- Describe command conventions, code style expectations, and how to add or modify agent behavior.
- Include cursor/copilot related guidance if such rules exist in this repo.

2) Local development and command surface
- Prerequisites: Bun is used as the primary toolchain. Node-based tooling can work if Bun is unavailable, but Bun is expected (>=1.0).
- Install dependencies: bun install
- Build: bun run build (compiles src/index.ts to dist/index.js using --target=bun)
- Run (production-like): bun run start "<your message>" [--flags]
- Development/reload: bun run dev "<your message>" [--flags]
- Type checking: bun run typecheck (runs tsc --noEmit)
- Run a single test (when tests exist):
  - If using Bun's test runner: bun test path/to/file.test.ts -t "should do something"
  - If using Vitest: vitest path/to/file.test.ts -t "should do something"
  - If using Jest: jest path/to/test-file.js -t "specific test name"
- Tests (when added): bun test or bun run test
- Linting: add a lint script (e.g., eslint) and run: bun run lint
- Pre-publish: bun run prepublishOnly (runs build automatically)

3) Code style guidelines (observed patterns from src/index.ts)
- Language and runtime: TypeScript with Bun. Source is ES module style ("type": "module" in package.json).
- Imports:
  - Use node built-ins with the node: prefix (e.g., import path from "node:path"; import fs from "node:fs/promises")
  - External dependencies import normally using named imports (e.g., import { createOpencode } from "@opencode-ai/sdk")
  - Import order: node: built-ins first, then external packages
- Formatting:
  - Consistent semicolon usage at end of statements
  - 2-space indentation (no tabs)
  - Mixed quotes: single quotes for imports/module specifiers, double quotes for string literals
  - Use EOL constant for newlines: const EOL = "\n"
- Types and interfaces:
  - Prefer explicit types over any
  - Use interfaces for complex object shapes (e.g., interface ParsedArgs { ... })
  - Use type aliases for simpler structural shapes (e.g., type EventLike = { type: string })
  - Leverage TypeScript unions for constrained fields (e.g., permission: "once" | "always" | "reject")
  - Use Record<string, unknown> for flexible dynamic data
- Error handling:
  - Do not swallow errors silently
  - Use try/catch blocks around I/O and network operations
  - Write errors to stderr: process.stderr.write(`[error] ${message}${EOL}`)
  - Provide fallback defaults with clear logs when appropriate
  - Exit with non-zero code on fatal errors: process.exit(1)
- Naming conventions:
  - camelCase for variables and functions (e.g., isUrl, sendCallback, flushStdout)
  - PascalCase for types, interfaces, and classes (e.g., ParsedArgs, EventLike)
  - UPPER_SNAKE for constants (e.g., EOL)
- Functions:
  - Use explicit return types for public functions
  - Prefer async/await over raw promises
  - Use early returns to reduce nesting
- Testing mindset:
  - Tests should cover critical paths, edge cases, and error scenarios
  - Aim for deterministic tests
- Documentation:
  - Document public APIs with JSDoc where useful
  - Include shebang for CLI entry points: #!/usr/bin/env bun
  - Keep inline comments concise
- Accessibility to code readers:
  - Prefer clarity over cleverness
  - Write self-documenting code

4) Cursor rules and Copilot guidance
- Cursor rules: No explicit Cursor rules found at .cursor/rules/ or .cursorrules
- Copilot instructions: No dedicated Copilot instruction file at .github/copilot-instructions.md
- If adding these rules, place them at the paths above and reference them here

5) Adding and adapting agents (explicit guidelines)
- Agent naming: Use lowercase-dashed IDs (e.g., code-reviewer, api-builder)
- Agent files: Organize agents under an agents/ directory or inline with src/ as appropriate
- Session management: Use persistent session_id to continue long-running agent work
- Granularity: Break complex tasks into atomic steps
- Verification: After delegations, verify changes with lsp_diagnostics and basic build/test checks
- Safety: Do not perform destructive actions (e.g., force-push) unless explicitly requested

6) Baseline contribution and testing workflow
- Add or update AGENTS.md at repo root for project-wide guidance
- If you modify agent rules, run typecheck and a minimal build to catch syntax errors
- Add a small, representative test or example demonstrating agent behavior when appropriate

7) File layout and future extensions
- Root: AGENTS.md (this file)
- Source: src/ directory containing TypeScript files
- Build output: dist/ directory (generated, not committed)
- Optional module-level: e.g., src/AGENTS.md, packages/xxx/AGENTS.md for large repos
- Cursor/Copilot docs: .cursor/ and .github/copilot-instructions.md (if used)

8) Evidence and verification hooks
- After changes, always run: bun install && bun run typecheck && bun run build
- If tests exist: bun run test -t "<name>" or equivalent per framework
- LSP diagnostics should pass on changed files before finalizing tasks
- Build should produce dist/index.js without errors

9) Known status for this repo
- Build and typecheck scripts exist (bun run build, bun run typecheck)
- No existing lint/test scripts at baseline; add as needed
- Single source file: src/index.ts (CLI entry point)
- TypeScript config extends @tsconfig/bun/tsconfig.json
- AGENTS.md exists and provides baseline guidance

Appendix: Quick-start example
- Install: bun install
- Build: bun run build
- Typecheck: bun run typecheck
- Run: bun run start "hello world"
- Run with options: bun run start "Refactor foo" --directory=/path/to/project --port=4096
- Tests (after adding): bun run test [path] [-t "name"]
