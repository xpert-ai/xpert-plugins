package io.github.jqdhm.contractreview;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static io.github.jqdhm.contractreview.ContractDtos.ErrorResponse;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorResponse> domainError(ApiException error) {
        return ResponseEntity.status(error.status()).body(new ErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ResponseEntity<ErrorResponse> invalidRequest(Exception ignored) {
        return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_REQUEST", "请求格式或字段不合法。"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorResponse> notFound() {
        return ResponseEntity.status(404).body(new ErrorResponse("NOT_FOUND", "记录或接口不存在。"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErrorResponse> methodNotAllowed() {
        return ResponseEntity.status(405).body(new ErrorResponse("METHOD_NOT_ALLOWED", "不支持此请求方法。"));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErrorResponse> unsupportedMediaType() {
        return ResponseEntity.status(415).body(new ErrorResponse("UNSUPPORTED_MEDIA_TYPE", "请求正文必须为 JSON。"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpectedError(Exception ignored) {
        return ResponseEntity.internalServerError().body(new ErrorResponse("INTERNAL_ERROR", "服务暂时不可用。"));
    }
}
