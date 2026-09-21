package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

class ApiSecurityFilterTest {
    @Test
    void absentTokenAlwaysFailsClosed() throws Exception {
        for (String configured : new String[]{null, "", " "}) {
            ApiSecurityFilter filter = new ApiSecurityFilter(new ServiceProperties(configured), new ObjectMapper());
            MockHttpServletRequest request = authorized(UUID.randomUUID().toString());
            MockHttpServletResponse response = new MockHttpServletResponse();
            AtomicBoolean called = new AtomicBoolean();
            filter.doFilter(request, response, (req, res) -> called.set(true));
            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("UNAUTHORIZED");
            assertThat(called).isFalse();
        }
    }

    @Test
    void chunkedBodiesAreBoundedEvenWithoutContentLength() throws Exception {
        String token = UUID.randomUUID().toString();
        ApiSecurityFilter filter = new ApiSecurityFilter(new ServiceProperties(token), new ObjectMapper());
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/contracts") {
            @Override public long getContentLengthLong() { return -1; }
            @Override public int getContentLength() { return -1; }
        };
        headers(request, token);
        request.setContent(new byte[ApiSecurityFilter.MAX_BODY_BYTES + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> called.set(true));
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }

    private static MockHttpServletRequest authorized(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/contracts");
        headers(request, token);
        return request;
    }

    private static void headers(MockHttpServletRequest request, String token) {
        request.addHeader("Authorization", "Bearer " + token);
        request.addHeader("X-Tenant-Id", "tenant");
        request.addHeader("X-Organization-Id", "organization");
        request.addHeader("X-User-Id", "user");
        request.addHeader("X-Assistant-Id", "assistant");
    }
}
