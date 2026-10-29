package io.github.jqdhm.contractreview;

public final class ApiException extends RuntimeException {
    private final int status;
    private final String code;

    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }

    public static ApiException conflict() {
        return new ApiException(409, "VERSION_CONFLICT", "记录已变更，请重新读取后操作。");
    }
}
