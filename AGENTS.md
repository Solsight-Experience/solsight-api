AGENTS.md

Purpose
This guide orients agentic coding tools to the build, test, and style rules
in this repository. Follow it for all contributions.

Repository Overview

- Stack: NestJS, TypeScript, TypeORM, PostgreSQL, Redis, Solana, Jest.
- Package manager: pnpm (see package.json packageManager).
- Source root: src (Nest CLI uses sourceRoot=src).

Commands
Install

- pnpm install

Build

- pnpm run build

Lint

- pnpm run lint

Format

- pnpm run format

Test (unit)

- pnpm run test
- pnpm run test:watch
- pnpm run test:cov
- pnpm run test:debug

Test (e2e)

- pnpm run test:e2e

Run (dev)

- pnpm run start:dev

Run (prod)

- pnpm run start:prod

Single-test recipes

- Unit test by path: pnpm run test -- --runTestsByPath src/path/to/file.spec.ts
- Unit test by name: pnpm run test -- --testNamePattern "My test name"
- E2E test by path: pnpm run test:e2e -- --runTestsByPath test/app.e2e-spec.ts
- E2E test by name: pnpm run test:e2e -- --testNamePattern "AppController"

Env and Runtime Notes

- Copy .env.example to .env and fill required values.
- PORT, API_PREFIX, API_VERSION, DB, Redis, Solana, JWT, and CORS are required.
- Avoid committing real secrets; use placeholders in docs and tests.

Code Style Sources

- ESLint config: eslint.config.mjs
- Prettier config: .prettierrc
- TypeScript compiler config: tsconfig.json

Formatting

- Prettier: singleQuote=true, trailingComma=all.
- Keep line wrapping reasonable; prefer readability over micro-optimizing line length.
- Use ASCII unless file already includes non-ASCII (some .env comments do).

Imports

- Prefer absolute module imports for external packages first, then internal paths.
- Keep NestJS decorators grouped in a single import when possible.
- Use type-only imports when the value is not needed at runtime.
- Avoid unused imports; eslint will flag them.

TypeScript and Types

- Project is not fully strict; still prefer explicit types at boundaries.
- DTOs use class-validator decorators; keep DTO fields typed and decorated.
- Use interfaces for request/response shapes when not using class-validator.
- Avoid "any" unless required; no-explicit-any is off but treat as last resort.
- When casting, add a short comment if the cast is non-obvious.

Naming Conventions

- Classes: PascalCase (e.g., WalletsService).
- Files: kebab-case or dot-suffixed Nest conventions (e.g., users.service.ts).
- DTOs: Suffix with Dto (e.g., CreateWalletDto).
- Entities: Suffix with Entity for files, class name is the domain noun.
- Guards/Interceptors/Pipes: Suffix with Guard/Interceptor/Pipe.

NestJS Patterns

- Modules declare providers/controllers/imports; keep feature boundaries in src/modules.
- Controllers handle transport concerns only; business logic in services.
- Inject repositories using @InjectRepository for TypeORM entities.
- Prefer dependency injection over static helpers.

Error Handling

- Use NestJS HttpException subclasses (BadRequestException, NotFoundException, etc.).
- For external API failures, log and return a safe fallback when reasonable.
- Do not swallow errors silently; log context via AppLoggerService where possible.
- Avoid leaking secrets in error messages.

Logging

- AppLoggerService uses winston; prefer it over console.log in application code.
- console.error is present in existing code; do not introduce more unless scoped.

Validation

- ValidationPipe is configured globally (whitelist, forbidNonWhitelisted, transform).
- DTOs should reflect request payloads and include appropriate validators.

Database

- Entities live under src/modules/\*/entities and use TypeORM decorators.
- Prefer repository methods for CRUD; avoid raw SQL unless necessary.
- Keep database access in services, not in controllers.

Testing Conventions

- Unit tests use Jest and live in src/** for spec files or test/** for e2e.
- Test file naming uses \*.spec.ts for unit tests.
- E2E tests live in test/ with jest-e2e config.
- Favor arrange/act/assert structure; keep tests deterministic.

API and HTTP

- Controllers use NestJS decorators (@Controller, @Get, @Post, etc.).
- Use DTOs for request bodies and validate with class-validator.
- Use API prefixes: app sets global prefix "api".

Project Structure

- src/app.module.ts is the root module.
- src/config contains setup and configuration helpers.
- src/infra contains external integrations (Solana, Jupiter, Coingecko).
- src/common for shared utilities, logging, filters, guards, etc.

Linting and Type Checks

- eslint: typescript-eslint recommendedTypeChecked enabled.
- projectService is enabled; keep TS config up to date when adding new tsconfig.
- Ensure lint passes before merging.

Cursor/Copilot Rules

- No Cursor rules found in .cursor/rules or .cursorrules.
- No Copilot instructions found in .github/copilot-instructions.md.

Contribution Expectations for Agents

- Prefer small, focused edits with minimal diffs.
- Update or add tests for behavior changes when feasible.
- Do not reformat unrelated code.
- Follow existing patterns in nearby files.

Quick Reference

- Lint: pnpm run lint
- Format: pnpm run format
- Test: pnpm run test
- E2E: pnpm run test:e2e
- Build: pnpm run build
