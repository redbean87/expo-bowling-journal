# Bowling Journal App – Agent Guidelines

## 1. Agent Safety & Task Authorization

- **Single-agent rule**: Do not spawn sub-agents unless the user explicitly requests it and the need is justified.
- **Ollama concurrency**: Never run more than one model-generation task against the shared Ollama server at a time.
- **Repository write guardrails**: The agent must not stage, commit, push, reset, clean, stash, rebase, amend, or otherwise alter Git state unless the user explicitly instructs it to do so.

## 2. Analysis → Approve → Implement Workflow

1. **Analysis**
   - Inspect the files directly relevant to the task and any additional files needed to understand the change.
   - Keep the investigation narrow.
   - Briefly explain why any additional files were examined.
   - Produce a concise findings report and high-level implementation plan.

2. **Approval**
   - Present the findings and plan to the user.
   - Wait for explicit approval before modifying files.

3. **Implementation**
   - Execute the approved plan in a separate implementation session.
   - Do not modify files outside the approved scope without returning to analysis and requesting approval.
   - If implementation reveals that the approved scope is insufficient, stop and report the newly discovered requirement rather than expanding scope automatically.

## 3. Context-Loading Rules

- Load only files directly relevant to the current task.
- The agent may discover and read additional files when necessary.
- Keep context narrow and explain the reason for significant additional file reads.
- Avoid broad, unnecessary repository loading.
- Do not automatically load README.md, CONTRIBUTING.md, ROADMAP.md, or unrelated documentation unless relevant to the task.

## 4. Implementation Boundaries

- **Scope**: Implement only the functionality described in the approved plan.
- **No implicit roadmap work**: Do not select or work on an unchecked item from ROADMAP.md unless the user explicitly asks for it.
- **No unrelated changes**: Do not alter styling, architecture, dependencies, or documentation unless required by the task.

## 5. Verification & Stop Condition

- After implementation, run the minimal relevant verification commands.
- When applicable, use:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test` or a targeted test suite
  - `npm --prefix worker run check` for worker-related changes
- If a check fails, preserve the changes, report the failure, and wait for user direction.
- After verification, report the files changed, checks performed, and results.
- Stop without committing or pushing.
- Allow the user to review and confirm whether the changes are acceptable.

## 6. Git Safety

- Do not stage, commit, push, reset, clean, stash, rebase, amend, or otherwise alter Git state unless the user explicitly instructs you to do so.
- Preserve existing user changes.
- Do not overwrite, discard, or revert unrelated uncommitted work.
- Before implementation, report whether the working tree contains existing changes.

## 7. Essential Project-Specific Guardrails

- **Import Pipeline**: When touching import-related code, preserve the status transition rules (`queued → parsing → importing → completed|failed`) and the `snapshotJson` transport.
- **Offline Queue**: All mutations that affect the journal must go through the `game-save-queue-syncer`.
- **Auth**: Do not perform operations that bypass `@convex-dev/auth`.
