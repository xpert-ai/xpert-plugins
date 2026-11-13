# Product scope and page wireframes

## User and problem

The target users are customer-service complaint specialists and their supervisors. The intended original workflow is manual reading, triage, reply drafting and disposition recording across individual notes or tickets. Repeatedly extracting the issue, urgency and requested resolution is time-consuming; an unrecorded chat reply is also difficult to resume or review. This problem statement is a product hypothesis, not a claim of completed customer research.

The App keeps one complaint as the business object throughout AI analysis, human review, confirmation and recovery. AI reduces the initial drafting work, but does not decide compensation, contact a customer or confirm a disposition.

## Core workflow and ownership

1. A person creates a case with a customer name and complaint content; a customer reference is optional. Creation validates and saves DRAFT.
2. Analyze starts a real host Assistant task on the existing case and moves it to PROCESSING.
3. The middleware's internal Tool validates seven structured fields and submits them for the current attempt. Success saves an AI original and enters PENDING_REVIEW.
4. A person views the original, edits the review and explicitly saves a human draft or confirms a human final result. Confirmation enters CONFIRMED without overwriting the original.
5. Reload reads the saved case and its results from the host-backed database.
6. A task failure becomes FAILED with a readable error. Retry starts another attempt on the same case; stale results cannot complete the new attempt.

The seven fields are summary, category, urgency, customerIntent, riskFlags, suggestedAction and replyDraft. Confirmation is a human View action, not an Agent Tool.

## Key page wireframes

These compact wireframes document the implemented information layout retrospectively. They are not a claim that a separate design artifact existed before development. The UI uses one Workbench, not separate list/create/detail routes. SOURCE: src/lib/remote-components/complaint-workbench/app.js, render, createForm, caseDetail and reviewForm.

```text
Workbench
+------------------------------------------------------------+
| Complaint Triage Workbench | total | Refresh | New complaint |
+----------------------+-------------------------------------+
| Case list            | Selected case reference / status    |
| Customer / preview   | Complaint input / attempt count     |
| Status / updated     | Analyze, Check status or Retry      |
|                      | AI original (read-only)             |
|                      | Human review or confirmed result    |
+----------------------+-------------------------------------+

Create (replaces the right pane)
+------------------------------------------------------------+
| Customer name *       | Customer reference (optional)      |
| Complaint content *                                        |
|                                     Cancel | Create        |
+------------------------------------------------------------+

Review (PENDING_REVIEW)
+------------------------------------------------------------+
| AI original (read-only)                                    |
| Human draft: summary, category, urgency, intent, risks,     |
| suggested action and reply draft                          |
|                              Save review | Confirm result  |
+------------------------------------------------------------+

Failure (FAILED)
+------------------------------------------------------------+
| Same saved complaint / attempt count                       |
| Readable error code and message                            |
| Retry analysis                                             |
+------------------------------------------------------------+
```

With no cases, the list/detail show an empty state and New complaint remains available. Invalid required fields give a correction prompt. Real-page images are embedded in the App README; wireframes are not runtime evidence.

## Deliberate scope

One reliable workflow takes priority over a complete support system. No attachments, channel ingestion, analytics, RAG, automatic message sending, complex role administration or re-analysis after confirmation are included. The UI shows the first 30 cases; search and paging controls are not implemented. Human edits survive navigation only after saving.

The most useful next improvements are verified stock-host reproduction, database integration tests, a durable task timeout/crash recovery mechanism, and paging for larger datasets. These are limitations or follow-ups, not completed features.

## Acceptance boundary

The required normal and original-case Retry flows have existing real-platform/user acceptance, with separate build, lifecycle and load records. Live acceptance used local Windows host patches outside the plugin. A stock upstream host run remains unverified; see [upstream host verification](upstream-host-verification.md). No performance, accuracy or customer-impact metric is claimed.
