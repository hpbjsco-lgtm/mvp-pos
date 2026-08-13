@CONTEXT.md

# {{PROJECT_NAME}} — AI Assistant Rules

> **First-time setup:** If `INIT.md` exists in this directory, read it and follow the initialization guide to set up the full project documentation system before doing any other work.

## Always conduct a thorough, comprehensive, and professional review. Take as much time and use as many tokens as needed. Check it as meticulously as possible to ensure the project is professional and effective. After each phase, if there are manual steps for the user, explain in detail with step-by-step instructions.

**NEVER write code, edit spec files, or make implementation changes without explicit user approval. The code must be written completely in English. Developer is using Vietnamese for communication only, do not use Vietnamese in code no matter what.**

## [CUSTOMIZE] Project Overview

**Project name**: MVP POS
**Description**: Phần mềm POS cho quán cà phê và siêu thị
**Tech Stack**: {{Languages: ReatJS}}
**DB**: SQLite, Cloud (It is possible to synchronize SQLite files to the cloud)
**Platform**: Cross Platform APP (Android , IOS) 
**Communication language**: Vietnamese
   I have business documentation located in the `document` folder. Please read FEATURES.md

---

## Core Workflow — User-Driven Development

**NEVER write code without explicit user approval.** Follow this strict flow for every implementation step:

1. **Present** — Explain what needs to be done, the options, tradeoffs, and your recommended approach.
2. **Discuss** — User reads, asks questions, gives feedback. Iterate until alignment is reached.
3. **Choose** — User explicitly selects the approach and says "go ahead" or equivalent.
4. **Plan** — Before planning, consult the **Documentation Map** and read the relevant spec files on demand. Never plan from memory alone — specs are the single source of truth. Research how similar professional projects structure their work. Write a detailed plan for user review. User approves before any code is written.
5. **Code** — Only after user approval, write the code.

**Critical Rules:**
- Before each implementation step, ask the user for direction. Do NOT auto-code.
- Present multiple options with pros/cons when there are meaningful alternatives.
- If only one reasonable approach exists, explain it and wait for confirmation.
- Break large phases into small, reviewable steps. One step at a time.
- After each step completes, summarize what was done and present the next step for approval.

---

## Rule 1: Think First, Then Act

Don't assume. Don't hide confusion. Surface tradeoffs. Never execute without approval.

**Before implementing:**
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Workflow for any problem/task:**
1. **Present options**: Show 2-3 approaches with pros/cons/tradeoffs for each
2. **Wait for user questions**: User may ask for more information, research, or clarification
3. **Wait for explicit approval**: User must explicitly say "go ahead", "write it", "implement this", or similar
4. **Only then execute**: Write code/spec changes based on the approved approach

This applies to ALL changes — spec documents, code files, config files, any project file.
"Check and update" = analyze and present options, NOT silently write everything.

## Rule 2: Be Honest About Uncertainty

- If a design decision has tradeoffs, say so clearly, explain the tradeoffs
- If a number/parameter is an educated guess, label it as such
- Never claim 100% certainty on design decisions — only production testing proves correctness
- Cite sources when making claims

## Rule 3: Surgical Changes

Touch only what you must. Clean up only your own mess.

**When editing existing code:**
- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it

**When your changes create orphans:**
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked

**The test:** Every changed line should trace directly to the user's request.

## Rule 4: Goal-Driven Execution & Testing

Define success criteria. Loop until verified. Tests are part of the definition of done.

**Transform tasks into verifiable goals:**
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

**For multi-step tasks, state a brief plan:**
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

**Test design principles:**
1. **Machine-readable output**: All test output must be parseable by AI — structured logs, clear pass/fail indicators, specific error messages with file:line references
2. **Verbose failure logging**: When a test fails, log enough context to diagnose by reading the log alone — input values, expected vs actual, stack trace
3. **Three-tier strategy**:
   - Unit tests: Pure logic, no I/O, milliseconds — run after every code change
   - Integration tests: Multiple components, I/O boundaries — run after each phase
   - E2E tests: Full system, real environment — run at milestones
4. **Log retention**: Test logs must be written to files so AI can read them in subsequent sessions
5. **Monotonic test count**: Any decrease in test count = regression = bug

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Rule 5: Phase-Based Execution

Every task MUST be scoped to fit within reasonable limits.

**Mandatory workflow:**
1. **Before starting**: Estimate scope. If too large (editing 5+ files, writing 200+ lines, 10+ edits across files), split into phases BEFORE writing any code
2. **Phase execution**: Complete one phase fully, then stop and propose the next phase. Do NOT start without user confirmation
3. **After all phases**: Run a final comprehensive check — verify cross-references, run tests, confirm no regressions
4. **When in doubt, split**: 2 small phases > 1 risky large phase. An incomplete edit is worse than a slower workflow

**Signs you should split:**
- Task touches more than 4-5 files
- Task requires both research AND implementation
- Task involves writing a new module/feature from scratch (>150 lines)
- Multiple independent subtasks bundled into one request

## Rule 7: Proactive Tool/Dependency Installation

1. **Just do it**: If AI can install it (via `winget`, `curl`, `npm`, `pip`, etc.), install immediately without asking
2. **Only ask when truly impossible**: Only explain manual steps when installation absolutely requires something AI cannot do (GUI-only installer, hardware changes)
3. **After any installation**: Verify with a version check command and confirm success

**Key principle**: Maximize autonomy. Do NOT ask for permission on routine installations.

## Rule 10: Debug Logging

All projects MUST implement structured debug logging that AI can parse directly.

**Format**: JSON Lines (`.jsonl`), one object per line:
```json
{"ts":"ISO-8601","level":"ERROR","tag":"Component","msg":"Description"}
```

**Required fields**: `ts` (ISO-8601), `level` (DEBUG/INFO/WARN/ERROR), `tag` (module name), `msg` (message)

**Design:**
- Ring buffer rotation (N files x M MB) — prevent unbounded growth
- Buffered writes with periodic flush
- Document log retrieval path in project CLAUDE.md

---

## [CUSTOMIZE] Documentation Architecture

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Các quy tắc làm việc với AI (file này) |
| `CONTEXT.md` | Bối cảnh, mục tiêu và kết quả mong muốn của dự án |
| `document/PROJECT_SPEC.md` | Trung tâm điều hướng — chứa toàn bộ đặc tả chi tiết của dự án |

## Documentation Map — Read On Demand

`CONTEXT.md` is auto-loaded via `@import` above — no action needed. Other files are loaded on demand based on the task:

| File | When to read |
|------|-------------|
| `document/PROJECT_SPEC.md` | Trước khi có thay đổi lớn về kiến trúc hoặc khi cần tìm hiểu sâu về một chức năng. |

**How it works:** Read the user's first message → determine which files are relevant based on this map → read them before responding.

## [CUSTOMIZE] Directory Structure

```
{{PROJECT_NAME}}/
├── CLAUDE.md                          # AI assistant rules (this file)
├── CONTEXT.md                         # Project background and goals
├── PROJECT_SPEC.md                    # Full project specification
├── .claude/
│   └── settings.local.json            # Claude local permissions
└── [project source code]
```

---

**These rules are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
