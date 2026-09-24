# Bowling Journal App – Agent Guidelines

This is the authoritative AI-agent instruction set for this repository.

## 1. Instruction Authority & Precedence

- **AGENTS.md is authoritative for AI-agent behavior.** This file is the single source of truth for how an AI coding agent operates in this repository.
- **Precedence.** If another repository document (for example `CONTRIBUTING.md`, `ROADMAP.md`, or any other markdown) conflicts with this file on AI-agent behavior, **this file takes precedence**.
- **Scope of this rule.** This precedence applies specifically to AI-agent behavior. It does not redefine or override normal project documentation (for example, how `CONTRIBUTING.md` describes human setup, deploy, or contributor workflow).

## 2. Human Decision Authority

The human developer is the **final authority** over:

- Product requirements
- Architecture
- Data models / schema
- API contracts
- Dependencies
- Scope
- Security decisions
- Bowling rules

The AI must **not** make any of these decisions autonomously. When a decision in this list is required and has not been explicitly specified or approved by the human, stop and ask.

## 3. Approval Model

The default operating model is:

**ANALYZE → REPORT → HUMAN APPROVAL → IMPLEMENT**

- Present findings and a plan, then wait for explicit human approval before modifying files.
- **Silence is not approval.** A lack of response, or an ambiguous response, is not approval.
- Do not implement a material change without an explicit human approval.

## 4. Agent Safety & Task Authorization

- **Single-agent rule**: Do not spawn sub-agents unless the user explicitly requests it and the need is justified.
- **Ollama concurrency**: Never run more than one model-generation task against the shared Ollama server at a time.
- **Repository write guardrails**: The agent must not stage, commit, push, reset, clean, stash, rebase, amend, or otherwise alter Git state unless the user explicitly instructs it to do so.

## 5. Analysis → Report → Approval → Implement Workflow

1. **Analyze.**
   - Inspect the files directly relevant to the task and any additional files needed to understand the change.
   - Keep the investigation narrow.
   - Briefly explain why any additional files were examined.
   - Produce a concise findings report and high-level implementation plan.
2. **Report.** Present the findings and plan to the human.
3. **Human approval.** Wait for explicit approval before modifying files. Silence is not approval.
4. **Implement.**
   - Execute the approved plan.
   - Do not modify files outside the approved scope without returning to analysis and requesting approval.
   - If implementation reveals that the approved scope is insufficient, stop and report the newly discovered requirement rather than expanding scope automatically.

## 6. Context-Loading Rules

- Load only files directly relevant to the current task.
- The agent may discover and read additional files when necessary.
- Keep context narrow and explain the reason for significant additional file reads.
- Avoid broad, unnecessary repository loading.
- Do not automatically load `AGENTS.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `README.md`, or other broad documentation as a default.
- Context is loaded based on **task relevance**, never as an automatic default workflow.

## 7. Ambiguity & Material Decisions

- If a requirement is ambiguous and resolving the ambiguity would **materially** affect behavior, architecture, data, security, dependencies, or scope, **stop and ask the human**.
- **Never guess** at a material product or architectural decision. When uncertain about the boundary, preserve the existing behavior and ask rather than guessing.

## 8. Implementation Boundaries

- **Scope**: Implement only the functionality described in the approved plan.
- **No implicit roadmap work**: Do not select or work on an unchecked item from `ROADMAP.md` unless the human explicitly assigns it.
- **No unrelated changes**: Do not alter styling, architecture, or documentation unless required by the task.
- **Dependencies**: Do not add, remove, or replace dependencies without explicit human authorization, even when the agent believes the dependency is technically necessary.
- **Schema & API contracts**:
  - Database/schema changes require explicit human authorization.
  - API / Convex function contract changes require explicit human authorization.
  - Respect existing locked-schema documentation (for example `convex_data_schema_locked.md`) where applicable.

## 9. Verification & Stop Condition

- After implementation, run the minimal relevant verification commands.
- When applicable, use:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test` or a targeted test suite
  - `npm --prefix worker run check` for worker-related changes
- **Verification honesty**: Report only the tests/checks you actually executed. **Never claim** a test, build, lint, or verification step was performed when it was not.
- If a check fails, preserve the changes, report the failure, and wait for user direction.
- After verification, report the files changed, checks performed, and results.
- Stop without committing or pushing.
- Allow the user to review and confirm whether the changes are acceptable.

## 10. Git Safety

- Do not stage, commit, push, reset, clean, stash, rebase, amend, or otherwise alter Git state unless the user explicitly instructs you to do so.
- Preserve existing user changes.
- Do not overwrite, discard, or revert unrelated uncommitted work.
- Before implementation, report whether the working tree contains existing changes.

## 11. Domain-Specific Guardrails

- **Bowling domain**: Bowling scoring/rules (rolls, frames, strikes, spares, open frames, the tenth frame, bonus rolls, games, series) are **domain requirements**, not implementation assumptions. Do **not** silently change bowling behavior because an implementation appears incorrect. If the existing implementation appears inconsistent with the intended bowling rules, or the intended behavior is unclear, **report the discrepancy and ask for direction** rather than changing it.
- **Import Pipeline**: When touching import-related code, preserve the status transition rules (`queued → parsing → importing → completed|failed`) and the `snapshotJson` transport.
- **Offline Queue**: All mutations that affect the journal must go through the `game-save-queue-syncer`.
- **Auth**: Do not perform operations that bypass `@convex-dev/auth`.
