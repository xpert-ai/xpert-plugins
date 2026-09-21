package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import static io.github.jqdhm.contractreview.ContractDtos.ErrorResponse;

@Component
public class ApiSecurityFilter extends OncePerRequestFilter {
    static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    private final ServiceProperties properties;
    private final ObjectMapper mapper;

    public ApiSecurityFilter(ServiceProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.equals("/api/contracts") && !path.startsWith("/api/contracts/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        String configured = properties.serviceToken();
        String authorization = request.getHeader("Authorization");
        if (configured == null || configured.isBlank() || authorization == null
                || !MessageDigest.isEqual(("Bearer " + configured).getBytes(StandardCharsets.UTF_8),
                        authorization.getBytes(StandardCharsets.UTF_8))) {
            reject(response, 401, "UNAUTHORIZED", "服务凭证未配置或无效。");
            return;
        }
        String tenant = request.getHeader("X-Tenant-Id");
        String organization = request.getHeader("X-Organization-Id");
        String user = request.getHeader("X-User-Id");
        String assistant = request.getHeader("X-Assistant-Id");
        if (!validScope(tenant) || !validScope(organization) || !validScope(user) || !validScope(assistant)) {
            reject(response, 401, "INVALID_SCOPE", "需要完整且有效的访问作用域。");
            return;
        }
        request.setAttribute(Scope.REQUEST_ATTRIBUTE, new Scope(tenant, organization, user, assistant));
        if (request.getContentLengthLong() > MAX_BODY_BYTES) {
            reject(response, 413, "REQUEST_TOO_LARGE", "请求正文超出 2 MiB 限制。");
            return;
        }
        if (request.getMethod().equals("POST") || request.getMethod().equals("PUT")) {
            byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
            if (body.length > MAX_BODY_BYTES) {
                reject(response, 413, "REQUEST_TOO_LARGE", "请求正文超出 2 MiB 限制。");
                return;
            }
            chain.doFilter(new BufferedRequest(request, body), response);
        } else {
            chain.doFilter(request, response);
        }
    }

    private static boolean validScope(String value) {
        return value != null && !value.isBlank() && value.length() <= 128
                && value.equals(value.strip()) && value.chars().noneMatch(Character::isISOControl);
    }

    private void reject(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getOutputStream(), new ErrorResponse(code, message));
    }

    private static final class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private BufferedRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] bytes, int offset, int length) { return input.read(bytes, offset, length); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
