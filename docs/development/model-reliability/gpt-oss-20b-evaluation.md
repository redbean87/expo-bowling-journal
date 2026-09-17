# GPT-OSS 20B Reliability Evaluation

**Date:** 2026-09-15
**Worker model:** `ollama/gpt-oss:20b`
**Supervisor model:** DeepSeek V4.1 Flash
**Execution environment:** Patched OpenCode headless runner
**Purpose:** Evaluate GPT-OSS as a repository-task worker under supervision.

## Executive Summary

GPT-OSS 20B demonstrated that it can execute repository operations, modify files, run commands, and create commits. However, repeated tests identified reliability weaknesses that make it unsuitable for unsupervised repository work.

The primary problems were not transport failures or inability to use tools. They were:

* Incorrect tool selection
* Inadequate investigation
* Failure to recover from incorrect approaches
* Skipped validation
* Weak semantic judgment
* Incomplete or misleading final reporting
* Unsupported claims about command results
* Reuse of prior output as though it were fresh evidence
* Failure to distinguish pre-existing problems from worker-caused problems without intervention

DeepSeek V4.1 Flash was able to supervise GPT-OSS, identify omissions, and obtain correct outcomes after intervention. GPT-OSS should therefore be treated as an optional, low-trust worker rather than an autonomous development agent.

## Test Environment

* Worker: `ollama/gpt-oss:20b`
* Supervisor: DeepSeek V4.1 Flash
* OpenCode execution used the patched binary:
  `/Users/cortezashley/.local/opencode-patched/bin/opencode`
* Baseline repository states were clean before each test.
* Tests were conducted against the PinPal/bowling repository documentation and related repository tooling.
* No application feature work was part of these tests.

## Findings

### 1. False Negative From Incorrect Search Tool

GPT-OSS attempted to locate PinPal references using literal filename glob patterns such as `PinPal` and `pinpal`.

All searches returned no files. It then concluded that the repository contained no PinPal references.

That conclusion was false. Independent content search located PinPal references in approximately 20 files, including documentation, tests, worker code, and import-related files.

When explicitly told that the conclusion was wrong, GPT-OSS repeated the same glob-based approach and again concluded that the content could not be found.

**Failure categories:**

* Incorrect tool usage
* Inadequate investigation
* Failure to recover
* Unsupported negative conclusion

**Assessment:** GPT-OSS did not understand the distinction between filename search and content search and did not adapt after correction.

### 2. Correct Search and Commit, but Weak Verification

In a subsequent test, GPT-OSS:

* Enumerated Markdown files
* Used `grep` to search file contents
* Located `docs/domain-model.md`
* Made a scoped documentation edit
* Created a valid commit
* Left the working tree clean

However:

* It did not run validation.
* It did not inspect the diff before committing.
* It introduced invisible non-breaking-space characters.
* Its final report omitted relevant command details.

**Assessment:** The mechanical workflow succeeded, but verification and edit hygiene were insufficient.

### 3. Semantically Questionable Documentation Edit

GPT-OSS removed Markdown emphasis from a table cell, claiming that the asterisks were stray and broke table formatting.

The claim was incorrect. Emphasis inside Markdown table cells is valid, and the document uses emphasis consistently in other table cells.

The edit was unnecessary and reduced consistency.

**Failure categories:**

* Incorrect semantic judgment
* Unsupported justification
* Insufficient inspection of surrounding conventions
* Failure to distinguish a real defect from stylistic preference

**Assessment:** GPT-OSS can produce syntactically valid changes that are not meaningful improvements.

### 4. Correct No-Op Decision, Incomplete Evidence

When asked to determine whether the Markdown emphasis issue warranted a change, GPT-OSS eventually made the correct decision:

* No change was warranted.
* No commit was created.
* The repository remained unchanged.

It also recovered from an invalid regular-expression search and abandoned an unavailable tool.

However, it:

* Did not run the required validation.
* Did not run or report Git status.
* Did not provide the requested defect/style/assumption classification.
* Assumed that no Markdown validator was available despite the repository having a `format:check` script.

**Assessment:** The high-level decision was correct, but the supporting investigation was incomplete.

### 5. Supervised Workflow Improved Results

Under explicit supervision, GPT-OSS:

* Inspected `package.json`
* Found and ran `npm run format:check`
* Ran lint and typecheck
* Reported a pre-existing formatting failure
* Ran Git status
* Correctly avoided making an unjustified change

DeepSeek identified missing steps and instructed GPT-OSS to complete them.

This demonstrated that supervision can improve the result, but the worker did not reliably perform the complete workflow independently.

### 6. Fresh-Evidence Integrity Problem

In one supervised run, GPT-OSS displayed command output in its final response as though it had just been generated during the recovery phase.

The actual recovery-phase commands were only:

* `git diff`
* `sed`

The displayed validation and Git-status output had been produced earlier. The underlying facts were accurate, but the evidence was presented without clearly distinguishing fresh output from prior output.

**Failure category:**

* Evidence-integrity/reporting failure

**Assessment:** Even when the final factual conclusion is correct, GPT-OSS may present historical or reconstructed evidence as fresh verification. This is unacceptable for high-trust autonomous workflows.

## What GPT-OSS Can Reliably Do

The tests indicate that GPT-OSS can:

* Read repository files
* Search content when it selects the correct tool
* Make simple scoped edits
* Execute shell commands
* Run common project checks
* Create commits
* Maintain a clean working tree
* Recover from some tool errors
* Make a correct no-op decision when the issue is clearly framed

## What GPT-OSS Cannot Yet Be Trusted to Do Autonomously

GPT-OSS should not be trusted to independently:

* Select the correct investigation tool in unfamiliar situations
* Infer repository-wide absence from failed searches
* Recover consistently after an incorrect approach
* Map abstract requirements to repository-specific tooling
* Distinguish meaningful defects from stylistic preferences
* Perform mandatory diff review
* Classify validation failures as pre-existing or newly introduced
* Report command evidence with reliable provenance
* Produce complete and accurate completion reports

## Architectural Decision

DeepSeek V4.1 Flash will remain the primary supervisor/orchestrator responsible for:

* Task decomposition
* Delegation to worker models
* Monitoring worker progress
* Detecting skipped steps and unsupported claims
* Reviewing validation results
* Verifying Git state
* Accepting or rejecting the final result

GPT-OSS 20B may be used only for bounded, low-risk subtasks where:

* The task is reversible
* The expected change is narrowly scoped
* Independent verification is available
* DeepSeek or external tooling performs final acceptance checks

GPT-OSS should not be treated as a self-verifying autonomous repository agent.

## Recommended Guardrails

The workflow should independently verify, rather than merely trust, worker claims.

For repository tasks involving changes or commits, verify:

```bash
git status --short
git diff --check
git diff
git log -1 --oneline
git show --stat --oneline HEAD
```

Additional safeguards should include:

* Require explicit command/result reporting.
* Require a diff review before commit.
* Require validation appropriate to the file type.
* Require comparison against the baseline when classifying failures as pre-existing.
* Distinguish fresh command output from historical output.
* Reject completion reports that omit required evidence.
* Prevent dependency installation unless explicitly authorized.
* Require no-op tasks to report why no change was warranted and what validation was performed.

## Final Assessment

GPT-OSS 20B is operationally capable but procedurally unreliable.

The model is suitable for experimentation and constrained worker roles, but the tests do not support using it as an unsupervised coding agent. DeepSeek-based supervision and independent repository verification are necessary to compensate for its weaknesses.
