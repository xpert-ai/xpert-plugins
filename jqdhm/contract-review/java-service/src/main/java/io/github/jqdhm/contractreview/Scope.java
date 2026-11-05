package io.github.jqdhm.contractreview;

public record Scope(String tenantId, String organizationId, String userId, String assistantId) {
    public static final String REQUEST_ATTRIBUTE = "io.github.jqdhm.contractreview.Scope";
}
