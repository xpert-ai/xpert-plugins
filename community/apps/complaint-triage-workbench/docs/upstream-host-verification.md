# Upstream host verification boundary

Recorded: 2026-09-19, Asia/Shanghai. Status: ISOLATED HOST PASSED WITH DISCLOSED FIXES; UNMODIFIED UPSTREAM HOST NOT VERIFIED.

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

Candidate inventory is now received (SOURCE: USER screenshot, 2026-09-18): Docker Server 27.2.0; WSL lists only docker-desktop, Running, version 2. The user also confirmed the Fork update 3c9f6a8e -> 0cf54302; local HEAD/tracking ref both independently resolve to 0cf5430262cfb1cd5f16d6fde6d09fe0d5db371c. The two inventory commands above are completed prerequisites, not commands the candidate must repeat.

The agent still cannot access the Docker named pipe and the renewed escalation request failed at approval review without execution. A separate Docker-only source verification kit was prepared outside the plugin repository: clean host archive at the fixed baseline, committed Complaint community source, unique images/project, dedicated database/cache/storage and loopback ports 3100/4300. Existing databases, secrets and 3000/4200 services are not used. PowerShell syntax parsing and Docker Compose config --quiet validation passed; validation did not contact the daemon, generate secrets or start services. Linux build/start and real workflow results remain unverified. No Ubuntu installation is required for this proposed Docker route.

The selected preparation route is the independent Docker source-build kit, not an unpinned latest image. Archives were regenerated with command-local core.autocrlf=false and core.eol=lf; no repository/global Git setting changed. Ten critical host files (loader, staging, SDK versioning, model-provider decorator, plugin config, Dockerfiles, nginx config and both Compose entrypoints) match baseline Git blobs by raw bytes; both entrypoints have zero CRLF sequences. All 25 plugin executable/build/test inputs match implementation-commit Git blobs by raw bytes. This is a scoped source check, not an all-platform-file audit or a runtime pass.

The prepared Start-Verification.ps1 is ready for execution in the candidate's Docker-authorized terminal; it has not built images or started that host. Compose syntax has passed configuration-only validation. Linux dependency installation/build, runtime isolation, ESM loading, model configuration and Assistant initialization still require execution evidence. The script stops on a failure and does not patch upstream source, delete volumes or stop existing services.

The first candidate execution then failed during filtered plugin dependency installation (SOURCE: USER screenshot a4b7b364, 2026-09-18): ERR_PNPM_WORKSPACE_PKG_NOT_FOUND in the unrelated CRM App for @xpert-ai/plugin-shadcn-ui@workspace:*. community/pnpm-workspace.yaml includes ../packages/*, but the initial verification kit exported/mounted community alone. This is a verification-kit omission, not evidence of a Complaint business failure or a stock-host loading failure; the host build stage was not reached. Root packages/ was subsequently exported from the same implementation commit and the kit now mounts the plugins parent, working from /workspace/community. No upstream source, package manifest, workspace configuration or Complaint code was changed. Corrected Linux installation/build remains pending execution.

A second candidate execution failed during dependency installation with ERR_PNPM_EACCES while renaming langsmith within the Windows bind-mounted node_modules (SOURCE: USER screenshot d1ed1982). No host build or real plugin load was reached. This establishes the failed filesystem operation, not a confirmed Windows locking/ACL cause. The verification kit was subsequently revised to export community/ and packages/ together as a fixed-commit source TAR, mount only that input read-only, and perform plugin extraction/install/build in dedicated Linux named volumes. The API reads the built plugin from the shared build volume read-only at the same installation path. Failed Windows dependencies, current services and existing data were preserved; no security policy or Complaint source manifest was changed.

## 2026-09-19 execution result

The revised isolated environment subsequently started as Compose project `complaint-stock-182f2f4` on loopback UI/API ports 4300/3100 with a dedicated fresh database. A JWT expiration type incompatibility in the source-built host blocked login and was corrected by a minimal local AuthService normalization with focused tests; that host change is outside the plugin repository and prevents this run from being described as unmodified upstream. The candidate then completed these checks (SOURCE: USER confirmations):

- local login and default organization access;
- Complaint plugin `0.2.1` installation and `loadStatus: loaded`;
- DeepSeek official provider installation, credential configuration without disclosure, and `deepseek-v4-flash` Primary Copilot selection;
- App template initialization and Complaint Workbench empty state;
- required-field validation, creation of `CLEAN-20260919-001`, and DRAFT reload;
- real structured AI analysis into PENDING_REVIEW, review persistence, confirmation, and final reload;
- controlled failure for `FAIL-20260919-001` by disabling Primary Copilot, followed by configuration restoration and Retry on the same case with total count unchanged and attempt count incremented;
- human edit/save/reload and final confirmation/reload after successful Retry.

This closes the prepared kit's isolated runtime/business-flow gate. It is manual real-platform evidence, not an automated PostgreSQL/model integration suite. It does not close the separate unmodified-upstream-host gate because the environment contains the disclosed Windows compatibility and Auth fixes.

For any additional unmodified-host certification, repeat the same flow on a supported host without the local Windows/Auth source changes. Keep that future result distinct from Harness mocks and the completed isolated fixed-host acceptance above.

If a stock-host problem persists, provide the recruiter with host/plugin SHAs, actual runtime versions, reproduction steps and redacted error evidence. The task allows recruiter-confirmed platform faults to be delivered with blocking evidence; no recruiter confirmation is claimed here. Do not invent a pass or ask the candidate to repair the host as a default requirement.
