# Resume Screening Assistant Requirements

## 1. Background And Goal

Resume Screening Assistant helps recruiters process early-stage candidate screening. The recruiter creates a job with JD and screening criteria, imports candidate resumes, asks an Xpert to extract structured resume facts and score each candidate against the JD, then reviews sorted recommendations and saves the final decision.

## 2. First Version Scope

- Create a screening job with title, JD, required skills, nice-to-have skills, minimum years of experience, and screening notes.
- Add candidate resumes from PDF, Word DOCX/DOC, or pasted text records.
- Ask the assistant to analyze pending or failed resumes.
- Save structured resume extraction through middleware tools.
- Save JD match score, recommendation, missing requirements, risk flags, and interview questions.
- Sort candidates by reviewer score or AI score.
- Let the recruiter mark candidates as interview, hold, or reject.
- Preserve failed records and retry them without creating duplicates.

## 3. Not Included In First Version

- Full ATS integration.
- Email, calendar, interview scheduling, or offer workflow.
- OCR for scanned or image-only resumes.
- Multi-user approval flow.
- External resume database synchronization.

## 4. Core Business Objects

- `ResumeScreeningJob`: job/JD and screening criteria.
- `ResumeCandidate`: one candidate resume, AI result, review status, retryable error state.

## 5. Agent And Plugin Responsibilities

The assistant reads the resume text and JD, extracts structured fields, scores the candidate, and calls middleware tools to save results.

The plugin owns durable business records, workbench data, retry state, review edits, and view actions.

## 6. Middleware Tools

- `resume_screening_save_extraction`
- `resume_screening_save_match_result`
- `resume_screening_report_failure`

## 7. View Actions

- `create_screening_job`
- `add_candidate_resume`
- `start_resume_analysis`
- `retry_candidate_analysis`
- `update_reviewer_decision`

## 8. Acceptance Points

- A recruiter can create a job.
- A recruiter can add multiple resumes to the job.
- AI can save extraction and match scoring for each resume.
- Candidate list is sorted by score.
- Recruiter can save a final review decision.
- Failed candidate analysis can be retried on the same record.
- Refreshing the workbench keeps records and statuses.
