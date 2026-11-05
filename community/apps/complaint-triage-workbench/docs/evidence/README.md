# Screenshot evidence

Recorded: 2026-09-18 (Asia/Shanghai), plugin 0.2.1. Business data is test data. Images are cropped to remove private host/account surroundings; no business value or state was altered. User originals remain unchanged. No mock/preview image is presented as real-platform evidence.

| File | Provenance | Visible facts | Limits |
| --- | --- | --- | --- |
| [plugin-version-021.png](plugin-version-021.png) | Crop of user-provided screenshot `98154f80` | Plugin name and 0.2.1 version | Badge alone does not prove runtime load; host descriptor independently reported loaded/system:global |
| [structured-review.png](structured-review.png) | Crop of user-provided screenshot `31784461` | Category, urgency, intent, risks, actions, reply draft and save/confirm controls | Summary/reference are outside crop; image alone does not prove model processing |
| [retry-confirmed-live.png](retry-confirmed-live.png) | Live Xpert browser capture before new regression case | RETRY-021, confirmed, two attempts, total four, AI original fields | Supporting final state only; failure and count 1 -> 2 transition were user-confirmed, not independently replayed this phase |
| [ordinary-chat-live.png](ordinary-chat-live.png) | Live new conversation after prompt publication | Workbench direction, no manually entered identifiers, human final confirmation | Verifies this real-model reply, not all future model behavior |
| [post-publish-pending-review.png](post-publish-pending-review.png) | Live browser regression with newly created fictitious case | POST-PUBLISH-021, pending review, one attempt, total five, structured AI original | Seven fields were inspected in the live UI; not all fit in this crop |
| [post-publish-confirmed-reload.png](post-publish-confirmed-reload.png) | Live capture after confirmation and page reload | Same reference, confirmed, one attempt, total five, unchanged AI original summary | Screenshot alone cannot prove the earlier reload; see execution record in acceptance.md |
| [post-publish-human-final.png](post-publish-human-final.png) | Continuation of the same reloaded detail, scrolled down | Human confirmed result and operator-revised summary | Reference is above the viewport; use with the preceding image and execution record |
| [failure-post-publish-025.png](failure-post-publish-025.png) | Privacy crop of user-provided screenshot `133906b1`, showing 2026-09-18 13:52 | POST-PUBLISH-025, FAILED, one attempt, total six, `assistant_task_failed`, readable Copilot-plan error and Retry control | Different case from POST-PUBLISH-021 and RETRY-021; no Retry execution, successful recovery, model configuration, or runtime version is proved by this image |

The new POST-PUBLISH-021 intentionally increased total four -> five. It is not a Retry-created duplicate. Existing cases were not edited or deleted. The human-summary change was a simulated reviewer action on this fictitious case, not a real customer disposition or message send.

## Evidence boundaries

The user-provided POST-PUBLISH-025 screenshot closes the missing FAILED/error/Retry-control image gap. Its error reads "当前会员计划无法使用该 Copilot 模型。" This is the visible host error, not an independently diagnosed subscription/configuration cause. The original screenshot's "Complaint analysis status resolved" success toast refers to status resolution; the business state is still FAILED. The privacy crop excludes the surrounding account header and toast, preserving the business facts.

Total six is a later user-provided observation, not the earlier four/five-case live baseline. It does not establish how the additional case was created. No independent failure replay or POST-PUBLISH-025 Retry success is claimed. Existing RETRY-021 recovery remains separately user-confirmed and supported by its final-state image. Do not combine different case references into a fabricated same-case sequence or claim a PostgreSQL integration suite. See [acceptance.md](../acceptance.md).
