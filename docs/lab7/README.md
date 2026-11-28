# CPE334 Lab 7: Adaptive Maintenance Engineering Contract

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479
## 1. Project and Approved Change

**Project:** Restaurant Queue Management System, CPE334 Software Engineering. **Group:** NaiCha; members 67070503456 and 67070503479. **Maintenance category:** adaptive maintenance. **Change:** CR-L7-01 / Issue 7.1, Change Impact Analysis and Engineering Contract Revision. Deadline: 29 November 2026, 23:59 Thailand time.

Sprint 1 assigns Operator A only to Queue R and Operator B only to Queue S. The approved change assigns both operators to both queues, allowing either to call, start and complete service, including cross-operator handoff. This gives restaurant staff flexibility to share workload without rerouting customers or transferring queue position. Backend authorization, state order, actual-actor auditing, concurrency safety, FIFO, party-size routing and one CALLED/SERVING entry per queue remain mandatory. [SRS §5](srs-revision.md#5-acceptance-criteria) is the authoritative source for the 15 acceptance criteria; the SRS also defines scope and invalid cases.

**TA change approval:** Prapatsorn Sangrod, TA, International Section; **23 November 2026**. The original approval screenshot supplied in the conversation will be attached to **GitHub Issue 7.1** and included in the final Lab 7 PDF. Repository storage of the image is not required. Attachment/PDF inclusion is pending; TA approval of the change does not constitute teammate acceptance of these contracts. Issue/PR URLs will be added when available.

## 2. Version Record and Verification Limits

The following repository facts were verified during the initial 23 November analysis and are preserved here as the historical maintenance reference, not a new claim about current HEAD or deployment.

| Point | Version and date | Source and interpretation |
| --- | --- | --- |
| Accepted Sprint 1 baseline from Lab 6 | 92125c402dedba8f3b4e43a57708d190f3c77311 | Initial local records did not establish formal Lab 6 acceptance. A release tag or local test report is not proof of acceptance. |
| Verified Sprint 1 release reference | `v0.1.0` → `f5b47ba99d3b7864460f3a27bbf85306a9fb67ad`; commit 7 November 2026 19:02:39 +07:00; annotated tag 8 November 2026 12:03:11 +07:00 | Initial tag/object and commit inspection; PR #30 merge subject and source establish exclusive A→R/B→S behavior. Formal Lab 6 acceptance remains unverified. |
| Actual prechange implementation | `fc178ed639619e3e74a37724a0373e990839a0e8`; 19 November 2026 23:42:30 +07:00 | Initial clean worktree/HEAD inspection on `docs/lab7-contract`, matching the then-local `lab7/maintenance` reference. Retain this code version for future RED evidence. |
| Relevant intervening development | `v0.1.0..fc178ed` | Initial log/tree comparison found Lab 5 Docker, CI/CD, GCP configuration and deployment documentation, Prisma binary targets and one login release label; no queue-rule change or implemented Sprint 2/3 domain increment in this range. |
| Separate Lab 6 history | `1f2bc813c14e50133a4d2b361f49839b00d804e8`, 23 November 2026 21:49:50 +07:00; `73b6041f5f9f9f03c592bb9a8ac784dae8f4e0cb`, 23 November 2026 22:07:35 +07:00 | Initially inspected `origin/lab6/uat`: controlled public-board count defect and isolated Docker UAT setup; outside the prechange commit's ancestry. Do not substitute them for accepted baseline evidence. |
| Deployed prechange revision / submitted release | **PENDING manual verification** | No cloud query or deployment verification is claimed. |

Older [release notes](../releases/v0.1.0.md) and [acceptance coverage](../sprint-1/acceptance-coverage.md) describe an Issue09 working tree based on `4055a963b345dc1182b90ee8ab93e74145dbcaa1` plus changes and retain draft release wording. They are historical execution records, not the accepted baseline. Remote-tracking branch names alone do not establish feature completion.

## 3. Documentation Index and Original Sources

| Document | Purpose |
| --- | --- |
| [README.md](README.md) | Change overview, versions, supersession, review status and external evidence workflow |
| [impact-analysis.md](impact-analysis.md) | Detailed requirement/component impacts, risks, historical data and regression selection |
| [srs-revision.md](srs-revision.md) | Normative changed/preserved requirements, all acceptance criteria and boundaries |
| [feature-sds-revision.md](feature-sds-revision.md) | Operator workflows, handoff, API contracts and error outcomes |
| [system-sds-revision.md](system-sds-revision.md) | Assignment, authorization, transaction, audit, persistence and UI design |
| [sts-revision.md](sts-revision.md) | Requirement→AC→test traceability and 20 future test specifications |

Original SRS, Feature SDS and System-Level SDS are combined in [Sprint 1 specification](../sprint-1/specification.md), Parts A, E and C respectively. Companion sources are the original [API contract](../sprint-1/api-spec.md), [UI contract](../sprint-1/ui-spec.md), [STS](../sprint-1/tests.md) and [release verification](../sprint-1/release-verification.md). Use named parts/headings where original subsection numbers do not exist.

## 4. Contract Supersession Policy

Original Sprint 1 contracts remain historical baseline records. These Lab 7 revisions supersede only the affected sections below **after teammate review and acceptance**. All unaffected Sprint 1 requirements remain valid; historical test results are not rewritten.

| Original source | Affected sections / identifiers | Replacement |
| --- | --- | --- |
| `docs/sprint-1/specification.md` | Issue08 assignment statements; D-20; Part A assumptions and FR-03/04/09–12, BR-11/16/17, NFR-05/13 shared-operator interpretation | SRS §§2–6; original IDs retained and L7 IDs added |
| Same specification | Part E F-02 seed/workflow and AC-009–011; F-05 workflow, exclusive AC-039 and shared-actor AC-032–044 coverage; matching Part B traceability | Feature SDS §§2–10; SRS §5; STS §§2–4 |
| Same specification | Part C assignment/dictionary, atomicity/concurrency and seed sections; Phase 4 call/start/complete actor interpretation | System SDS §§2–11 |
| `docs/sprint-1/api-spec.md` | Issue08 exclusive assignment examples, F-02 list outputs, F-05 shared actors | Feature SDS §2 and workflows; System SDS §8; endpoint shapes retained |
| `docs/sprint-1/ui-spec.md` | Exclusive assigned-selector assumptions in Issue08/F-02 and shared F-05 controls | Feature SDS §3; System SDS §9 |
| `docs/sprint-1/tests.md` | Exclusive seeded-assignment expectations in TEST-009–011/039/053/055; shared-actor coverage in TEST-035/036/040/041/043/056/057 | STS §§2–4; genuinely unassigned-operator denial retained |
| `docs/sprint-1/acceptance-coverage.md` | Historical results remain unchanged | New contract traceability in STS §2; future results collected separately |


## Revision History

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 contract package | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Consolidated into six documents; SRS owns acceptance criteria; README owns review status; external evidence workflow | PENDING teammate review |
