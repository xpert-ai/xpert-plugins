# Upstream host verification boundary

Recorded: 2026-09-18, Asia/Shanghai. Status: NOT VERIFIED. This document is a preparation/diagnostic record, not a completed stock-host acceptance report.

## What has passed

The Complaint plugin implementation at 4a115e6f398a1e6f16494c895ec0f8b0493293be has standalone and fresh-community installation/build/27-test/mock-Harness evidence. Real normal and original-case Retry workflows have separately attributed acceptance on the local Xpert host. That host is main baseline 182f2f4a7d05d968016a9ec20a93833687c4394f with local Windows npm, ESM-loading and model-provider path patches. These patches are not in the plugin PR.

## Read-only preparation findings

- The local host and running environment were not reset, reinstalled, stopped or modified during this delivery follow-up.
- docker version failed for the agent account with Docker config/named-pipe access denied. wsl --list --verbose failed with Wsl/EnumerateDistros/Service/E_ACCESSDENIED. Neither result establishes that Docker is stopped or WSL is absent for the candidate's account.
- Escalated requests for both read-only checks failed at the approval service with HTTP 503 and were not executed. No alternate credential/daemon-access path was used to bypass approval.
- The root Xpert docker-compose.yml builds api and webapp from .deploy/api/Dockerfile and .deploy/webapp/Dockerfile. In contrast, docker/docker-compose.yml uses published latest images. A latest image cannot be assumed to represent the recorded main baseline SHA.
- Baseline plugin-loader.ts loadModule has different production/development paths; production uses cjsRequire(target). The API Dockerfile uses Node 20 and a production runtime. Merely moving to Linux does not prove that this ESM plugin will load unchanged through that path. A real load check is still required.

These are SOURCE: CODE/COMMAND findings, not a fresh stock-host plugin failure or a recruiter-confirmed platform defect.

## Candidate handoff prerequisite

From the candidate's ordinary PowerShell terminal, run only:

```powershell
docker version --format '{{.Server.Version}}'
wsl --list --verbose
```

Report the version and distribution names/status, or provide an error screenshot. Do not share docker config, .env files, model keys or login tokens. These commands are inventory checks, not installation steps. No existing container or process should be stopped.

## Next verification gate

After inventory is available, select the supported independent source-based route. Use an exact clean source snapshot of the recorded host main baseline, not the patched active worktree or an unpinned latest image. Build plugin assets inside the chosen OS context. Isolate database/cache/volumes and HTTP ports from the active environment, verify port availability, and record the actual Node/package manager/runtime versions. Do not attach the active host database or reuse its token/model secrets silently.

This phase has not created or started that host. Compose isolation, Linux dependency installation, ESM loading, model configuration and Assistant initialization remain to be verified before runnable provisioning commands can be claimed.

The candidate must log into a new independent host and configure an authorized tool-calling model when requested. Repeat real plugin installation/load, template creation/publication, normal AI/human/save/reload and failure/original-case Retry. Keep each result distinct from Harness mocks and prior Windows acceptance.

If a stock-host problem persists, provide the recruiter with host/plugin SHAs, actual runtime versions, reproduction steps and redacted error evidence. The task allows recruiter-confirmed platform faults to be delivered with blocking evidence; no recruiter confirmation is claimed here. Do not invent a pass or ask the candidate to repair the host as a default requirement.
