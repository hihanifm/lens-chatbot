# Agent Environment

## Available tools

- **bash / sh** — shell execution
- **python3** — available at `python3`
- **rg** (ripgrep) — fast file content search, prefer over grep: `rg <pattern> <path>`
- **jq** — JSON processing: `jq '.field' file.json`
- **grep, awk, sed, find, cut, sort** — standard Unix tools

## Workspace layout

Each bug analysis runs in an isolated workspace:

```
<workspacePath>/
  bug.json          ← raw bug tracker data
  bug_summary.md    ← formatted bug summary
  attachments/      ← downloaded log and attachment files
  agent_notes/      ← save your findings here
```

## Skills

If a skills directory is provided in the task prompt, read the relevant skill files
before starting analysis. Each skill file is a markdown document describing a
specialised analysis technique. Apply the ones relevant to the bug at hand.

Starter skills shipped with this tool (in the skills/ directory of the repo,
mounted at `/app/skills` in Docker):

- **explore-workspace.md** — list all files, auto-extract zip attachments
- **search-logs.md** — fast log search patterns using `rg`

Developers can add their own skill files to the skills directory.

## Notes

- Do not modify files outside the workspace.
- Prefer `rg` over `grep` for searching large log files — it is significantly faster.
- Write your findings to `agent_notes/` so they persist across conversation turns.


<claude-mem-context>
# Memory Context

# [lens-chatbot] recent context, 2026-05-16 4:19pm EDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,223t read) | 212,968t work | 92% savings

### May 16, 2026
428 1:33p 🔵 Complete skill loading pipeline verified in Cline SDK
429 1:34p ⚖️ Agent skills integration approach finalized
431 1:36p ⚖️ Agent skills implementation simplified to directory hint approach
433 1:53p 🔵 Located branding elements in index.html for WarRoom rebranding
434 1:54p ✅ Updated page title to WarRoom branding
435 " ✅ Added CSS styling for sidebar WarRoom brand element
436 1:55p 🟣 Added bug refresh endpoint to sync latest bug data from tracker
437 " 🔴 Fixed mock bug data to use dynamic timestamp instead of hardcoded date
438 " ✅ Deployed WarRoom rebranding and refresh-bug endpoint to main branch
439 1:56p ✅ Updated CLAUDE.md to document e2e testing commands
440 " ✅ Updated CLAUDE.md architecture diagram with accurate file roles and e2e test structure
441 " ✅ Corrected line numbers in CLAUDE.md swapping implementations table
442 2:00p 🔵 Dockerfile confirms Python is not available in lens-chatbot Docker environment
S213 Add support for agent skills in Cline SDK: enable agents to load and apply skills from a configurable folder without custom parsing logic. (May 16 at 2:02 PM)
443 2:35p ⚖️ Skills Discovery via Directory Hint for Bug-Analysis Agent
444 2:36p ⚖️ Plan Expanded: agents.md as Universal Agent Context
445 2:41p ⚖️ Path resolution for agents.md using import.meta.dirname
446 2:45p ⚖️ Agent skills and environment context implementation strategy
447 " ✅ Added python3, jq, ripgrep to Docker base stage
448 " 🟣 Created agents.md environment context file
449 " ✅ Extended clineSdkRunner.ts to reference agents.md
450 " 🟣 Extended buildPrompt to include agents.md and optional SKILLS_DIR
451 " ✅ Added python3, jq, ripgrep to Docker prod stage
S214 Create skills directory and sample skills for bug analysis — specifically a skill to list files and auto-extract downloaded zip attachments, plus additional log-search capabilities (May 16 at 2:46 PM)
452 2:52p 🟣 Explore Workspace Skill Created
453 " 🟣 Search Logs Skill Created
454 " ✅ Skills Framework Documented in Agent Environment Guide
455 " ✅ Docker Build Updated to Include Skills Directory
456 " ✅ Dev Environment Configured with SKILLS_DIR Variable
S215 Create skills directory and sample skills for bug analysis — implement file listing and zip extraction, plus log search patterns to support agent-driven bug investigation (May 16 at 2:53 PM)
457 2:54p 🟣 Agent Skills Framework Committed and Integrated
S216 Create agent skills framework for bug analysis — implement file discovery and log search skills, with support for extensible custom skills and multi-directory organization (May 16 at 2:54 PM)
458 " 🟣 Multi-Directory Skills Support via PATH-style SKILLS_DIR
459 2:55p ✅ Environment Documentation Updated for Multi-Directory Skills
460 " 🟣 Multi-Directory Skills Support Shipped
S217 Create agent skills framework for extensible bug analysis, plus fix rigid system prompt to enable natural conversational responses (May 16 at 2:55 PM)
461 2:58p 🔵 Rigid System Prompt Limits Agent Conversational Capability
462 " ⚖️ Flexible System Prompt Strategy for Varied Question Types
463 3:00p ⚖️ Simplified System Prompt — Minimal Constraints Over Detailed Routing
464 3:03p ✅ System Prompt Refactored for Flexible Response Types
465 " 🟣 Flexible System Prompt Deployed to Production
S218 Discussion on system prompt design and how effective prompts guide LLM behavior without over-scripting responses (May 16 at 3:03 PM)
S219 Add support for dynamic agent skill loading from configurable directory - enable Cline SDK agents to discover and use markdown-based skills without hardcoding (May 16 at 3:10 PM)
466 3:16p 🔵 SSE Event Flow Architecture in Lens Chatbot
467 3:17p ⚖️ Skill Auto-Select via Triggers and UI Visualization
469 3:27p ⚖️ Approved plan: Skill directory + LLM-driven selection + system prompt refinement
470 3:28p 🟣 System prompt refactored for responsive, context-aware answers
471 " 🟣 Skill loader module implemented for dynamic skill discovery
472 " 🟣 Skill directory support added to agent prompt builder with colon-separated SKILLS_DIR
473 " 🔵 Existing skill files in place: explore-workspace and search-logs
474 " ✅ Skill frontmatter added to explore-workspace and search-logs
475 " ✅ buildPrompt refactored to accept pre-loaded skills instead of parsing env var
476 " ✅ Import skillsLoader module in clineSdkRunner
477 " 🟣 Skill loading integrated into agent analyze method with status event
479 " ✅ Skill loader implementation committed to main branch
S220 Implement dynamic agent skill loading from configurable directory with minimal backend code, relying on LLM to select relevant skills based on frontmatter triggers (May 16 at 3:29 PM)
480 3:31p ✅ CLAUDE.md updated to document skills system and design principles
481 " ✅ CLAUDE.md documentation update committed to main branch
S221 Architectural exploration: can the bug analysis system run headless (autonomous, no UI) to process bug assignments from a queue and post results back as comments (May 16 at 3:32 PM)
S222 Architectural vision exploration: design a "Generate Patch" skill to enable agent-autonomous bug fixing with human review, demonstrating full autonomous on-call engineer workflow (May 16 at 3:34 PM)
**Investigated**: Reviewed agent tool capabilities (execute_command, file write already available), analyzed skill format and how it integrates with agent workflow, mapped combination of patch generation skill + headless watcher architecture into full autonomous bug-fixing pipeline, evaluated human review gate as safety layer

**Learned**: Agent already possesses execute_command and file write tools needed for autonomous patching; skill format is minimal markdown + instructions (no special implementation needed); agent can autonomously locate source files, make edits, generate unified diffs via git, and write artifacts to agent_notes; skills system supports this workflow without backend changes; headless architecture + skill system together enable full autonomous workflow: detect assignment → analyze → identify root cause → generate patch → post results → human review gate

**Completed**: Conceptual design of "Generate Patch" skill defined: minimal markdown frontmatter (name, description, triggers), agent instructions to locate file, make change, run git diff, save to agent_notes/fix.patch; architecture validated as capable of supporting full autonomous workflow from bug assignment through patch generation

**Next Steps**: Pending user direction on implementation; if proceeding: create Generate Patch skill file in skills/ directory; implement headless poller/webhook to watch bug tracker for assignments; build queue processor to orchestrate analyze → patch generation flow; implement bug tracker comment posting to return both analysis and diff; establish human review and merge process; potential: extend agents.md with guidance on repo-aware patching context


Access 213k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>