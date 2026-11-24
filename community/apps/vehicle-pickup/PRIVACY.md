# Privacy

The Vehicle Pickup plugin is designed to run inside the Xpert platform and stores only the data needed to provide its approval workflow.

## Data stored

- Tenant, organization, user, store and carrier identifiers supplied by the trusted platform runtime context.
- Vehicle numbers and vehicle-status snapshots used by the pickup request.
- Request status, approval or rejection reason, cancellation reason and execution attempts.
- Operation log entries, including actor role, status transitions, reasons and timestamps.

## Purpose

The data is used to create and display pickup requests, enforce organization and role permissions, perform approval-time revalidation, and provide an auditable request history.

## External transmission

The plugin does not include telemetry, advertising or OCR services. Conversation and tool results may be processed by the model provider configured by the Xpert platform administrator. The plugin does not embed or select a separate external model endpoint.

## Retention and access

Records are stored in the Xpert platform database and are scoped by tenant and organization. Retention and deletion follow the platform administrator's database policies. The plugin does not copy business records to a separate service.

## Contact

Open an issue in the source repository for privacy or data-handling questions.
