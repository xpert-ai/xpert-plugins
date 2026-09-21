# Java Contract Review Implementation Plan

Status as of 2026-09-21: the local implementation, Java service, Xpert adapter, workbench, and real local Ollama flow have been verified. The checklist below is the original task breakdown; see `docs/validation.md` for completed checks and the remaining real-Xpert installation boundary.

> **For agentic workers:** Use parallel bounded implementation tasks; main agent reviews interfaces and final changes.

**Goal:** Deliver an installable Xpert contract-review app with Java-owned business rules and a human review desk.

**Architecture:** Xpert model → typed tools → TS HTTP adapter → Java transactional service; workbench actions use the same service for manual changes and confirmation.

**Tech Stack:** Java 21, Spring Boot 3, Maven, JDBC, H2; Node 22, TypeScript, Xpert SDK 3.18.4.

**Spec:** docs/design.md

## Global Constraints

- All additions stay within jqdhm/contract-review; no changes to upstream plugins.
- Tokens are external configuration; identity comes from Xpert context only.
- Agent has no confirm/update tool. Exact source evidence is mandatory for extracted values.
- Root plugin-dev-harness lifecycle validation is required; actual host/model verification is reported separately.

## Task 1: Java service

Files: java-service/pom.xml, src/main/java/io/github/jqdhm/contractreview/*, resources/application.yml/schema.sql, src/test/java/... .

- [ ] Implement specification DTOs, bearer authentication, scoped JDBC persistence and bounded REST endpoints.
- [ ] Test create → edit → confirm → summary and all failure/concurrency boundaries listed in spec.
- [ ] Run mvn test/package; report precise results.

## Task 2: Xpert adapter

Files: package.json, tsconfig.json, src/index.ts, src/lib/{config,client,scope,contracts,middleware,view-provider,plugin,templates}.ts, assistant.yaml, test/*.

- [ ] Reuse existing SDK extension points, pinned published types and explicit field schemas.
- [ ] Test context enforcement, timeouts, malformed input, tool restrictions, and metadata/template alignment.
- [ ] Build ESM/declarations and package assets; run typecheck and tests.

## Task 3: Workbench and documentation

Files: src/remote/*, scripts/*, README.md, examples/*, Dockerfile/compose.yaml, docs/validation.md.

- [ ] Build scoped list/detail/field evidence editor with pending/error/confirmation behavior through platform bridge.
- [ ] Provide fictional sample input, setup commands, manual validation, limitations and AI-assisted development notes.
- [ ] Exercise UI with a clearly labeled bridge test host; run actual Java integration and plugin harness.

## Task 4: Delivery

- [ ] Review spec and code; resolve critical findings and run required targeted checks.
- [ ] Check staged diff for secrets and unrelated changes, commit, push feature branch to Fork via authenticated Git.
- [ ] Use gh pr create --base main with an exact body file. Record checks and remaining host/model requirements. Do not merge.
