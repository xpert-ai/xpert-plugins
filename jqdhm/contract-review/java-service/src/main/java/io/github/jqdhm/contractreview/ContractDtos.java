package io.github.jqdhm.contractreview;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class ContractDtos {
    private ContractDtos() { }

    public record FieldValue(@NotBlank @Size(max = 50_000) String value,
                             @NotBlank @Size(max = 50_000) String evidence) { }

    public record Fields(@Valid FieldValue partyA, @Valid FieldValue partyB,
                         @Valid FieldValue amount, @Valid FieldValue effectiveDate,
                         @Valid FieldValue expiryDate, @Valid FieldValue paymentTerms) { }

    public record CreateRequest(@NotBlank @Size(max = 128) String requestKey,
                                @NotBlank @Size(max = 120) String title,
                                @NotBlank @Size(max = 50_000) String sourceText,
                                @NotNull @Valid Fields fields) { }

    public record ExtractRequest(@NotBlank @Size(max = 128) String requestKey,
                                 @NotBlank @Size(max = 120) String title,
                                 @NotBlank @Size(max = 6_000) String sourceText) { }

    public record UpdateRequest(@NotNull @Min(1) Long expectedVersion,
                                @NotNull @Valid Fields fields) { }

    public record ConfirmRequest(@NotNull @Min(1) Long expectedVersion) { }

    public enum Status { DRAFT, CONFIRMED }

    public enum Action { CREATED, UPDATED, CONFIRMED }

    public record AuditEntry(Action action, String actorId, Instant at) { }

    public record Contract(String id, String title, String sourceText, Fields fields,
                           Status status, long version, List<String> warnings,
                           Instant createdAt, Instant updatedAt, List<AuditEntry> audit) { }

    public record ListItem(String id, String title, Status status, long version,
                           Instant updatedAt, List<String> warnings) { }

    public record ContractList(List<ListItem> items) { }

    public record Summary(Status status, String summary) { }

    public record ErrorResponse(String code, String message) { }

    public record CreateResult(Contract contract, boolean created) { }
}
