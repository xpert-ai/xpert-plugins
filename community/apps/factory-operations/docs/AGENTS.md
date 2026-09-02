# Documentation instructions

## Product vocabulary

- Use “Factory Case” for the persisted anomaly aggregate.
- Use “Agent” and “Assistant” with Xpert capitalization.
- Use “Workbench” for the Remote View surface.
- Call `simulation` a clearly marked simulation, never a production execution.
- Distinguish plan proposal, human approval, execution confirmation, and recovery verification.

## Writing rules

- Write operator-facing content in concise Simplified Chinese; keep identifiers and commands in English.
- Treat `需求设计.md`, the versioned blueprint, TypeScript domain state machine, and current Xpert 3.16 contracts as source material.
- Never document an external adapter, automatic approval, PLC control, or production confirmation that the implementation does not provide.
- Update `acceptance.mdx` whenever lifecycle behavior or boundaries change.
- Use active voice, sentence-case headings, and code formatting for paths, identifiers, commands, status values, and error codes.

## Content boundaries

- Document configuration and operational behavior, but never include tenant data, secrets, tokens, internal URLs, or database credentials.
- State validation evidence precisely. Do not describe a dry run or fixture as a live platform execution.

