<!--
  Sync Impact Report
  ==================
  Version change: 1.2.0 → 1.3.0
  Rationale: MINOR — new Architecture Constraint section (Domain Registration
  Process) and expanded governance references based on the Domain Registration
  Guide (LW_domain_注册指南_2026_05_14.md).

  Modified principles:
    - VI. Domain Plugin Passivity → added reference to Registration Guide
          for complete manifest requirements (six blocks A–F)

  Added sections:
    - Architecture Constraints > Domain Registration Process (new)
      Codifies the 8-step mandatory registration process, page component
      data access rules, and Nexus inviolability boundary.

  Updated sections:
    - Governance > Document Authority Chain → added Domain Registration
      Guide between Constitution and 总体设计

  Templates requiring updates:
    - .specify/templates/plan-template.md       ✅ no changes needed
    - .specify/templates/spec-template.md        ✅ no changes needed
    - .specify/templates/tasks-template.md       ✅ no changes needed

  Follow-up TODOs: none
-->

# Lifeware Constitution

## Core Principles

### I. Intent-Driven, Not Feature-Driven

The system responds to user intent rather than presenting features. The
Intent Engine is the **sole entry point** for all write operations,
including those originating from the Bridge Layer. The Action Surface
Engine is the **sole output channel**. No component may bypass this
intent-to-action pipeline.

Intent Engine processing has two distinct phases:

- **Phase A (Routing)**: A bounded classification task that maps user
  input to a `(targetDomain, action)` pair with confidence score.
  This is "interpretive execution" — AI MUST participate. Domain
  manifests provide `intent_triggers` as structured routing context.
  The output space is bounded: only registered Domain actions are
  candidates. Low confidence triggers user clarification.
- **Phase B (Field Completion)**: A structured extraction task that
  populates `StructuredIntent` fields from user input and Domain
  `required_fields`. This is "contract execution" — output types are
  determined. AI assists but the result is deterministic.

Users may submit intent through three input methods: natural language
(default path through both phases), slash shortcuts (`/domain:action`,
fast path skipping Phase A with confidence = 1.0), or function menu
(direct template form). Slash shortcuts and function menu enter
Phase B directly.

For complex create/plan operations, an AI Markdown workflow is
supported: AI generates Markdown from Domain-defined templates and
user attachments, user edits collaboratively, Intent Engine parses
confirmed Markdown into `StructuredIntent`(s) following the standard
Nexus chain. Cross-Domain batch processing from a single Markdown is
deferred to post-MVP.

**Rationale**: Ensures every system mutation is traceable to a user
intention. The two-phase model separates AI-dependent classification
from deterministic field extraction, enabling clear testing boundaries
and graceful degradation (Phase A failure → template form fallback).

**How to apply**: Any new write path MUST route through Intent Engine.
UI components MUST NOT directly call State Machine or Repository
write methods. Domain manifests MUST include `intent_triggers` for
Phase A routing context.

### II. Energy-First Scheduling

Energy is a co-equal scheduling dimension with time. The Rule Engine's
highest enforcement principle is: "Energy mismatch, execution does not
start." The system MUST use user-calibrated energy data rather than
system predictions. MVP scope: single energy dimension (1–10 scale).

**Rationale**: Distinguishes Lifeware from conventional time-management
tools. Biological rhythm awareness is a core value proposition.

**How to apply**: Timebox creation and task scheduling MUST validate
energy compatibility. User calibration values override system defaults.

### III. Single-Writer Invariant

Four components hold exclusive write authority — no other component may
usurp their responsibilities:

| Component | Exclusive Authority |
|---|---|
| State Machine | System state writes; generic lifecycle executor that validates transitions against Domain manifest `lifecycle` declarations (accepts only StateProposal from Orchestrator or time triggers) |
| Memory Framework | Memory writes (all levels L1–L5); Derived Signals as the sole read interface for external consumers |
| Intent Engine | Intent parsing and StructuredIntent production |
| Action Surface Engine | Output presentation (Action Guide, Dynamic Tile, Continuity Cue) |

**Rationale**: Prevents race conditions, ensures auditability, and
enables each component to reason about its invariants without
coordinating with peers.

**How to apply**: Code reviews MUST reject any PR where a component
outside these four performs its reserved write operation.

### IV. USOM Sovereignty & Document Authority

The priority chain for resolving design disputes is:

**USOM Document > Database Design Document > Schema Code**

Every capability MUST map to a USOM object; if it cannot, it MUST NOT
be implemented. New USOM fields MUST be defined in documentation before
code. Domain plugins MUST only receive `USOMSnapshot` — never
`ContextSnapshot` or raw database rows.

**Rationale**: Documentation-first development prevents code-driven
schema drift and ensures all stakeholders share a single mental model.

**How to apply**: When schema code conflicts with USOM documentation,
the documentation wins. Update the document first, then align the code.

### V. Repository Interface Isolation

Nexus components MUST NOT directly call Drizzle. All data access goes
through Repository interfaces whose input/output types are USOM objects
or USOM IDs — never database row objects. Raw SQL is prohibited; all
queries use the Drizzle query builder. Drizzle schema is the single
schema source for all platforms.

**Rationale**: Enables future database migration (PostgreSQL → SQLite
WASM) without modifying Nexus logic. Decouples business rules from
storage implementation.

**How to apply**: Any `import` of Drizzle symbols in Nexus or Domain
files is a violation. Repository files are the only permitted location.

### VI. Domain Plugin Passivity

Domain plugins operate under a strict "four-hook, three-prohibition"
model:

**Permitted (four hooks)**:
1. `onValidate` — structural validation of intents
2. `onEvent` — return metrics and suggestions (no state mutation)
3. `onActionSurfaceRequest` — return action candidates
4. `onOutboundRequest` — declare outbound push intent (optional, not in MVP)

**Prohibited**:
1. Writing state directly
2. Autonomous execution without Nexus orchestration
3. Accessing other domains' internal data

Domain return values MUST use `USOM_ID` references, not full objects.

Domain manifests MUST include two self-description declarations:

1. `intent_triggers`: Structured routing context for Intent Engine
   Phase A (action name, description, examples, keywords, signals,
   excludes). Enables bounded classification without hard-coding
   routing logic into Intent Engine.
2. `lifecycle`: Object lifecycle definitions and state transition
   rules (from → to, trigger type `'intent'|'time'`, irreversible
   states). Enables State Machine to validate transitions generically
   without per-Domain business knowledge.

These are passive declarations, not execution capabilities. They do
not violate Domain passivity.

In addition to `intent_triggers` and `lifecycle`, manifests MUST
include the complete six-block structure defined in the Domain
Registration Guide: field metadata (C), list actions (D),
required fields and templates (E), and event subscriptions (F).
Each block serves a distinct consumer (Presentation Layer, Intent
Engine, Event Bus) and MUST NOT be omitted.

**Rationale**: Keeps domains composable and testable. Prevents
cross-domain coupling and ensures the Orchestrator remains the sole
workflow coordinator. Manifest self-description prevents coupling
leakage into Nexus components. Complete six-block manifests ensure
every consumer has the data it needs without ad-hoc code.

**How to apply**: Each domain plugin file MUST implement only the four
hooks. Any state-mutating code inside a domain is a violation. Domain
manifests MUST include all six blocks (A–F). Adding a new Domain
MUST NOT require modifying Intent Engine routing logic or State Machine
transition rules. Refer to `mydocs/core/LW_domain_注册指南_2026_05_14.md`
for the complete step-by-step registration process.

### VII. Bridge Layer Readiness

Bridge Layer constraints take effect from the first line of MVP code:

| ID | Constraint |
|---|---|
| A | All external writes MUST traverse the full Nexus chain (Intent Engine → Rule Engine → State Machine) |
| B | MCP Tools expose only read queries and intent submission — no direct CRUD |
| C | Derived Signals is the ONLY memory entry point for Agent reads; L2–L5 layers are not exposed |
| D | Nexus method signatures MUST NOT depend on HTTP context; they MUST be callable from Bridge Layer |

Bridge Layer implementation is deferred to Phase 2, but interface
compatibility is enforced from MVP.

**Rationale**: Prevents architectural shortcuts during MVP that would
require breaking refactors when Bridge Layer is added.

**How to apply**: Nexus methods MUST accept plain USOM types, not
Request/Response objects. Any HTTP-aware type in Nexus is a violation.

### VIII. AI/Rule Boundary

AI handles ambiguity; rules handle certainty. AI participates in Intent
Engine Phase A (routing classification) and Phase B (field extraction),
Presentation (report generation), and Domain Plugin (domain-specific
logic). AI MUST NOT participate in Rule Engine, State Machine, or
time-conflict detection. AI generates proposals — it NEVER directly
writes system state.

The Intent Engine two-phase model enforces this boundary: Phase A
(routing) is interpretive and AI-dependent; Phase B (field completion)
and all subsequent stages are contract-type execution where AI assists
but output types are predetermined. Once `StructuredIntent` is formed,
the pipeline is fully deterministic.

When AI fails, the Intent Engine MUST degrade gracefully to template-form
fallback, producing an equivalent `StructuredIntent`.

**Rationale**: Deterministic rules ensure safety invariants (energy
mismatch, WIP limits). AI provides flexibility where rules cannot
cover all cases. The two-phase model makes the boundary explicit and
testable at each phase transition.

**How to apply**: Rule Engine files MUST NOT import AI/LLM SDKs. Intent
Engine files MUST include a non-AI fallback path tested independently.
Phase A and Phase B MUST have separate test suites — Phase A tests
routing accuracy, Phase B tests field extraction completeness.

## Architecture Constraints

### Multi-Tenancy (From Day One)

| ID | Constraint |
|---|---|
| T-01 | All business tables MUST contain `user_id` foreign key |
| T-02 | All queries MUST include `user_id` filter; Repository layer handles injection |
| T-03 | Nexus components MUST NOT be aware of `user_id` |
| T-04 | `ContextSnapshot` and `USOMSnapshot` MUST include `userId` |

### Database Access

| ID | Constraint |
|---|---|
| R-01 | Nexus components MUST NOT directly call Drizzle |
| R-02 | Repository input/output MUST be USOM objects or IDs |
| R-03 | Repository handles bidirectional DB ↔ USOM mapping |
| R-04 | UI components MUST only receive USOM objects |

### JSONB Usage

**Allowed**: Event payloads, configuration/metadata, embedded documents
(ReviewSection[]), optional complex objects (RecurrenceRule).

**Forbidden** (must be independent columns with indexes): Status fields,
time fields (`due_date`, `start_time`), foreign key references, enum
fields (`priority`, `energy_level`).

### Event Sourcing

`system_events` is append-only. The Repository MUST expose only `insert`
— never `update` or `delete`. Modifying historical events is an
architectural violation.

### Orchestrator Purity

The Orchestrator is a pure dispatcher. It MUST NOT contain business
logic, write state, or participate in AI calls. It handles exceptions,
retries, human-decision pause points, and cross-Domain intent
splitting (sequential processing of multiple `StructuredIntent`s
derived from a single user input) only.

### Domain Manifest Self-Description

Domain manifests MUST declare two structured fields enabling Nexus
components to operate generically without per-Domain hard-coding:

| Field | Consumer | Purpose |
|---|---|---|
| `intent_triggers` | Intent Engine (Phase A) | Bounded classification context for routing user input to Domain actions |
| `lifecycle` | State Machine | Object lifecycle definitions and transition rules for validating state changes |

These declarations MUST be structured (not free-form text) to enable
deterministic processing. Adding a new Domain MUST NOT require
modifying Nexus components — only registering new manifest declarations.

**Rationale**: Prevents coupling leakage between State Machine and
Domain-specific lifecycle rules. State Machine is a generic executor;
Domain manifests are the business knowledge source.

### Domain Registration Process

All new Domains MUST follow the mandatory 8-step registration process
defined in `mydocs/core/LW_domain_注册指南_2026_05_14.md`. This
section codifies the architectural invariants enforced by that process.

**Mandatory registration steps**:

1. Declare new USOM object types (if any) in USOM documentation
2. Write `manifest.yaml` with all six blocks (A–F)
3. Implement four hook functions (pure functions, no side effects)
4. Define Drizzle DB Schema
5. Implement Repository interface
6. Implement Domain page components (view_routes)
7. Register Domain in `domains/registry.ts`
8. Implement Markdown templates (optional)

**Nexus inviolability**: If completing any step requires modifying Nexus
core components (Intent Engine, Rule Engine, State Machine, Action
Surface Engine, Orchestrator), the boundary is broken. Stop and discuss
before proceeding. The only permitted Nexus modification is adding a new
object's Summary to `ContextSnapshot` — this is a legitimate aggregation
need, not coupling leakage.

**Page component data access rules**:

| Operation Type | Path | Rationale |
|---|---|---|
| Read (list, detail) | Repository directly | No state mutation, Rule Engine has no value |
| Write (create, update, delete, lifecycle) | `PrebuiltIntent` → Nexus chain | All state mutations must traverse full chain for consistency |

Page components MUST NOT:
- Directly call hook functions from `hooks.ts`
- Directly import Drizzle schema or `db/` modules
- Bypass Repository interface for data access

**Manifest completeness**: Every registered Domain MUST have a
`manifest.yaml` containing all six blocks. Incomplete manifests
(block C–F omitted) are a registration violation and MUST be resolved
before the Domain is considered production-ready.

**Rationale**: The registration process ensures every Domain is
self-contained, fully declared, and operates within Nexus boundaries
without requiring Nexus modifications. This is the operational
foundation for Domain Plugin Passivity (VI) and the Single-Writer
Invariant (III).

**How to apply**: Before implementing any new Domain, read the
Registration Guide in full. Verify each step's checklist before
proceeding to the next. The guide is the authoritative reference;
this constitution codifies the architectural invariants it enforces.

## Methodology Governance

### Design-Time vs. Runtime Separation

Design-time (developer + AI extracts principles into static config)
and runtime (Nexus executes codified rules; AI for dialog guidance
only) MUST NOT be conflated. Runtime MUST NEVER interpret raw
methodology text.

### Layer 1 Rule Immutability

Methodology rules (`methodology/rules/`) are cross-user principles
maintained via Git by humans. They MUST NOT be auto-modified by
execution data. Execution failure triggers calibration review, not
rule revision.

### Rule Engine Coaching, Not Gatekeeping

The Rule Engine produces exactly three result types: `pass`,
`warning`, and `confirm`. It MUST NEVER block user actions. Lifeware
is a coach, not a gatekeeper.

### Calibration Governance

Calibration proposals appear only during Review cycles — never
proactively interrupting the user. User responses: confirm (adjust
parameter), exception (reset counter, keep rule), or skip (reappear
next cycle).

### Conflict Arbitration Hierarchy

Methodology conflicts are resolved by strict tier priority:

- **Tier 0 (Hard constraints)**: Time exclusivity > Capacity limits
- **Tier 1 (Strong recommendations)**: Deadline urgency > Energy match
  > Timebox lock > OKR alignment > Habit protection
- **Tier 2 (Gentle suggestions)**: Alternating schedule / streak
  preservation / learning curve

Cross-tier conflicts: higher tier always wins.

## Governance

This constitution is the authoritative governance document for the
Lifeware project. In case of conflict between this constitution and
any other document, practice, or convention, this constitution takes
precedence — except where `LW_overall_项目开发必读` (Project Must-Read)
defines a higher-level product decision that supersedes architectural
rules.

### Document Ownership Model

All project documents follow a three-tier ownership model. The tier
determines who initiates changes and who executes them.

| Tier | Directory | Owner | Claude's Role |
|---|---|---|---|
| 1 — User-owned | `mydocs/` | User | Read-only. Updates only when user explicitly requests. |
| 2 — Co-maintained | `docs/` | User defines intent, Claude executes | Ensures consistency with code. User does not directly edit. |
| 3 — Auto-maintained | Root + `.specify/` | Claude | Mechanical tracking. User approves changes. |

**Tier 1 documents** (`mydocs/`): Product vision, architecture decisions,
methodology philosophy. These express the user's creative and domain
expertise. Claude MUST NOT modify them unless the user issues an
explicit instruction referencing a specific discussion outcome.

**Tier 2 documents** (`docs/`): Implementation-level design that MUST
stay in sync with code (`usom-design.md`, `database-design.md`). The
user describes intent ("add a HabitLog object"); Claude updates the
document, schema code, and cross-references in one atomic change.

**Tier 3 documents**: `manifest.md` (version tracking), `CLAUDE.md`
(developer guidance), this constitution, and `specs/` (speckit
artifacts). Claude updates these mechanically when triggered by
workflow events or document changes.

### Amendment Procedure

1. Propose amendment with written rationale and impact analysis.
2. Verify no existing principle is violated without explicit
   superseding language.
3. Update this document and increment version per semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR**: New principle/section added or materially expanded
     guidance.
   - **PATCH**: Clarifications, wording fixes, non-semantic refinements.
4. Run consistency propagation across all Spec Kit templates.
5. Update `manifest.md` version history.

### Compliance Review

- All PRs MUST verify compliance with the Single-Writer Invariant (III),
  Repository Isolation (V), Domain Passivity (VI), and Bridge Layer
  Readiness (VII).
- Code commits violating Architecture Constraints (R-01 through R-04,
  T-01 through T-04) are treated as technical debt and MUST be resolved
  within the current iteration.
- Complexity introduced without necessity MUST be justified in the
  Complexity Tracking section of the implementation plan.

### Document Authority Chain

```
mydocs/core/项目开发必读         (product decisions — Tier 1)
    ↓
Lifeware Constitution           (architectural governance — Tier 3)
    ↓
mydocs/core/总体设计             (overall design constraints — Tier 1)
    ↓
mydocs/core/Domain注册指南       (Domain development process — Tier 1)
    ↓
docs/usom-design.md             (object model definitions — Tier 2)
    ↓
docs/database-design.md         (physical schema — Tier 2)
    ↓
Drizzle Schema Code             (implementation)
```

The Domain Registration Guide (`mydocs/core/LW_domain_注册指南_*`)
is a Tier 1 document and required reading for all Domain development.
It provides the concrete step-by-step process that operationalizes the
architectural invariants defined in this constitution.

**Version**: 1.3.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-15
