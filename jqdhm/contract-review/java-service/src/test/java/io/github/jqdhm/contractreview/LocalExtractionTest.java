package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static io.github.jqdhm.contractreview.ContractDtos.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:extraction-tests;DB_CLOSE_DELAY=-1",
        "contract.ollama.timeout-seconds=1"})
@ActiveProfiles("local-extraction")
@AutoConfigureMockMvc
class LocalExtractionTest {
    private static final String TOKEN = UUID.randomUUID().toString();
    private static final String SOURCE = "  甲方：青禾公司\n乙方：星桥公司\n金额：10000元\n  ";
    private static final HttpServer OLLAMA;
    private static final AtomicReference<String> RESPONSE = new AtomicReference<>();
    private static final AtomicReference<String> MODEL_REQUEST = new AtomicReference<>();
    private static final AtomicInteger CALLS = new AtomicInteger();
    private static volatile int modelStatus = 200;
    private static volatile long delayMillis;
    private static volatile long bodyDelayMillis;
    private static volatile CountDownLatch entered = new CountDownLatch(1);
    static {
        try {
            OLLAMA = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            OLLAMA.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
            OLLAMA.createContext("/api/chat", exchange -> {
                CALLS.incrementAndGet();
                MODEL_REQUEST.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                entered.countDown();
                int status = modelStatus;
                String response = RESPONSE.get();
                try {
                    Thread.sleep(delayMillis);
                    if (status == 302) exchange.getResponseHeaders().set("Location", "/forbidden-redirect");
                    byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, bytes.length);
                    Thread.sleep(bodyDelayMillis);
                    exchange.getResponseBody().write(bytes);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                } finally {
                    exchange.close();
                }
            });
            OLLAMA.createContext("/forbidden-redirect", exchange -> {
                CALLS.addAndGet(1000);
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
            });
            OLLAMA.start();
        } catch (Exception failure) { throw new ExceptionInInitializerError(failure); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry properties) {
        properties.add("contract.service-token", () -> TOKEN);
        properties.add("contract.ollama.base-url", () -> "http://127.0.0.1:" + OLLAMA.getAddress().getPort());
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void reset() throws Exception {
        jdbc.update("DELETE FROM contracts");
        CALLS.set(0);
        delayMillis = 0;
        bodyDelayMillis = 0;
        modelStatus = 200;
        entered = new CountDownLatch(1);
        modelOutput(mapper.writeValueAsString(Map.of("fields", fields())));
    }

    @AfterAll
    static void shutdown() { OLLAMA.stop(0); }

    @Test
    void realHttpExtractionValidatesFieldsPreservesCallerInputAndRequiresHumanConfirmation() throws Exception {
        JsonNode contract = extract("first", "user-one", 201);
        assertThat(contract.path("sourceText").asText()).isEqualTo(SOURCE);
        assertThat(contract.path("title").asText()).isEqualTo("调用者标题");
        assertThat(contract.path("status").asText()).isEqualTo("DRAFT");
        assertThat(contract.path("audit").get(0).path("actorId").asText()).isEqualTo("user-one");
        assertThat(contract.path("warnings")).hasSize(3);
        JsonNode payload = mapper.readTree(MODEL_REQUEST.get());
        assertThat(payload.path("model").asText()).isEqualTo("qwen2.5:7b");
        assertThat(payload.path("stream").asBoolean()).isFalse();
        assertThat(payload.path("messages").get(1).path("content").asText()).isEqualTo(SOURCE);
        assertThat(payload.path("format").path("properties").path("fields").path("required")).hasSize(6);
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", contract.path("id").asText()), "user-one")
                        .content("{\"expectedVersion\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    @Test
    void failedModelCanRetryTheSameSavedOriginal() throws Exception {
        modelStatus = 503;
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("retry-pending")))
                .andExpect(status().isBadGateway());
        String originalId = jdbc.queryForObject("SELECT id FROM contracts", String.class);
        assertPendingDraftCount(1);
        modelStatus = 200;
        JsonNode recovered = extract("retry-pending", "user-one", 200);
        assertThat(recovered.path("id").asText()).isEqualTo(originalId);
        assertThat(recovered.path("extractionPending").asBoolean()).isFalse();
        assertThat(recovered.path("version").asInt()).isEqualTo(2);
        assertThat(rowCount()).isEqualTo(1);
    }

    @Test
    void lateModelResultDoesNotOverwriteManualChangesDuringInference() throws Exception {
        delayMillis = 500;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = executor.submit(() -> extract("late-result", "user-one", 201));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            String id = jdbc.queryForObject("SELECT id FROM contracts", String.class);
            mvc.perform(scoped(put("/api/contracts/{id}", id), "user-one")
                            .content(mapper.writeValueAsString(new UpdateRequest(1L,
                                    new Fields(null, null, null, null, null, null)))))
                    .andExpect(status().isOk());
            JsonNode result = running.get(3, TimeUnit.SECONDS);
            assertThat(result.path("version").asInt()).isEqualTo(2);
            assertThat(result.path("fields").path("partyA").isNull()).isTrue();
            assertThat(result.path("audit").get(1).path("action").asText()).isEqualTo("UPDATED");
        }
    }

    @Test
    void retriesReuseSavedFieldsWithoutCallingModelAndChangedOriginalInputConflicts() throws Exception {
        JsonNode first = extract("repeat", "user-one", 201);
        RESPONSE.set("model offline now");
        JsonNode replay = extract("repeat", "user-one", 200);
        assertThat(replay).isEqualTo(first);
        assertThat(CALLS.get()).isEqualTo(1);
        for (ExtractRequest changed : List.of(new ExtractRequest("repeat", "不同标题", SOURCE),
                new ExtractRequest("repeat", "调用者标题", SOURCE + "追加正文"))) {
            mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(mapper.writeValueAsString(changed)))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
        }
        assertThat(rowCount()).isEqualTo(1);
    }

    @Test
    void missingValuesBecomeWarningsButInventedEvidenceIsRejected() throws Exception {
        modelOutput(mapper.writeValueAsString(Map.of("fields", new Fields(null, null, null, null, null, null))));
        JsonNode empty = extract("empty", "user-one", 201);
        assertThat(empty.path("warnings")).hasSize(6);
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", empty.path("id").asText()), "user-one")
                        .content("{\"expectedVersion\":2}"))
                .andExpect(status().isUnprocessableEntity());
        modelOutput(mapper.writeValueAsString(Map.of("fields",
                new Fields(new FieldValue("不存在公司", "甲方：不存在公司"), null, null, null, null, null))));
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one")
                        .content(mapper.writeValueAsString(new ExtractRequest("invented", "校验伪造证据", SOURCE))))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("EVIDENCE_MISMATCH"));
        assertThat(rowCount()).isEqualTo(2);
        assertPendingDraftCount(1);
    }

    @Test
    void malformedAndInjectedModelOutputCannotAlterIdentityOriginalTextOrStatus() throws Exception {
        String validFields = mapper.writeValueAsString(fields());
        for (String invalid : List.of("not json", "{\"fields\":{}}",
                "{\"fields\":" + validFields + ",\"status\":\"CONFIRMED\",\"sourceText\":\"fake\"}",
                "{\"fields\":{\"partyA\":{\"value\":123,\"evidence\":\"123\"},\"partyB\":null,\"amount\":null,"
                        + "\"effectiveDate\":null,\"expiryDate\":null,\"paymentTerms\":null}}")) {
            modelOutput(invalid);
            mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request(UUID.randomUUID().toString())))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("MODEL_OUTPUT_INVALID"));
        }
        assertThat(rowCount()).isEqualTo(1);
        assertPendingDraftCount(1);
    }

    @Test
    void endpointRequiresAuthenticationRejectsExtraRequestFieldsAndEnforcesInputLimit() throws Exception {
        mvc.perform(post("/api/contracts/extract").contentType(MediaType.APPLICATION_JSON).content(request("auth")))
                .andExpect(status().isUnauthorized());
        var forged = mapper.readTree(request("forged")).deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) forged).put("userId", "another-user");
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(forged.toString()))
                .andExpect(status().isBadRequest());
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one")
                        .content(mapper.writeValueAsString(new ExtractRequest("oversize", "标题", "字".repeat(6_001)))))
                .andExpect(status().isBadRequest());
        assertThat(CALLS.get()).isZero();
    }

    @Test
    void scopeIsolatesIdempotencyAndStoredResults() throws Exception {
        String first = extract("same-key", "user-one", 201).path("id").asText();
        String second = extract("same-key", "user-two", 201).path("id").asText();
        assertThat(first).isNotEqualTo(second);
        mvc.perform(scoped(get("/api/contracts/{id}", first), "user-two")).andExpect(status().isNotFound());
        assertThat(CALLS.get()).isEqualTo(2);
    }

    @Test
    void unavailableRedirectAndTimeoutPreserveOriginalWithoutSavingCandidatesOrFallingBack() throws Exception {
        for (int error : List.of(503, 302)) {
            modelStatus = error;
            mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("down-" + error)))
                    .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("MODEL_UNAVAILABLE"));
        }
        assertThat(CALLS.get()).isEqualTo(2);
        modelStatus = 200;
        delayMillis = 1800;
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("timeout")))
                .andExpect(status().isGatewayTimeout()).andExpect(jsonPath("$.code").value("MODEL_TIMEOUT"));
        assertThat(rowCount()).isEqualTo(1);
        assertPendingDraftCount(1);
    }

    @Test
    void busyModelRejectsParallelInferenceAndReleasesPermitAfterCompletion() throws Exception {
        delayMillis = 500;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = executor.submit(() -> extract("running", "user-one", 201));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("busy")))
                    .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("MODEL_BUSY"));
            running.get(3, TimeUnit.SECONDS);
        }
        delayMillis = 0;
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one")
                        .content(mapper.writeValueAsString(new ExtractRequest("after-complete", "另一份原文", SOURCE))))
                .andExpect(status().isCreated());
        assertThat(CALLS.get()).isEqualTo(2);
    }

    @Test
    void slowResponseBodyIsTimedOutAndLargeResponsesAreBounded() throws Exception {
        bodyDelayMillis = 1800;
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("slow-body")))
                .andExpect(status().isGatewayTimeout()).andExpect(jsonPath("$.code").value("MODEL_TIMEOUT"));
        bodyDelayMillis = 0;
        RESPONSE.set("x".repeat(262_145));
        mvc.perform(scoped(post("/api/contracts/extract"), "user-one").content(request("huge-response")))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("MODEL_OUTPUT_INVALID"));
        assertThat(rowCount()).isEqualTo(1);
        assertPendingDraftCount(1);
    }

    @Test
    void workbenchIntakeAndRefreshedLocalExtractionShareOneContract() throws Exception {
        String response = mvc.perform(scoped(post("/api/contracts/intake"), "user-one")
                        .content(mapper.writeValueAsString(new IntakeRequest("调用者标题", SOURCE))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = mapper.readTree(response).path("id").asText();
        JsonNode extracted = extract("page-key-one", "user-one", 200);
        assertThat(extracted.path("id").asText()).isEqualTo(id);
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", id), "user-one")
                        .content("{\"expectedVersion\":2}"))
                .andExpect(status().isOk());
        JsonNode refreshed = extract("new-key-after-refresh", "user-one", 200);
        assertThat(refreshed.path("id").asText()).isEqualTo(id);
        assertThat(refreshed.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(CALLS.get()).isEqualTo(1);
        assertThat(rowCount()).isEqualTo(1);
    }

    private void modelOutput(String fieldsJson) throws Exception {
        RESPONSE.set(mapper.writeValueAsString(Map.of("message", Map.of("role", "assistant", "content", fieldsJson), "done", true)));
    }

    private JsonNode extract(String key, String user, int statusCode) throws Exception {
        return mapper.readTree(mvc.perform(scoped(post("/api/contracts/extract"), user).content(request(key)))
                .andExpect(status().is(statusCode)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String request(String key) throws Exception {
        return mapper.writeValueAsString(new ExtractRequest(key, "调用者标题", SOURCE));
    }

    private int rowCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM contracts", Integer.class); }

    private void assertPendingDraftCount(int expected) throws Exception {
        var records = jdbc.queryForList("SELECT id FROM contracts WHERE version = 1");
        assertThat(records).hasSize(expected);
        for (var record : records) {
            mvc.perform(scoped(get("/api/contracts/{id}", record.get("ID")), "user-one"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.sourceText").value(SOURCE))
                    .andExpect(jsonPath("$.status").value("DRAFT"))
                    .andExpect(jsonPath("$.extractionPending").value(true))
                    .andExpect(jsonPath("$.audit.length()").value(1))
                    .andExpect(jsonPath("$.audit[0].action").value("RECEIVED"))
                    .andExpect(jsonPath("$.fields.partyA").isEmpty());
        }
    }

    private static MockHttpServletRequestBuilder scoped(MockHttpServletRequestBuilder request, String user) {
        return request.contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + TOKEN)
                .header("X-Tenant-Id", "tenant-one").header("X-Organization-Id", "org-one")
                .header("X-User-Id", user).header("X-Assistant-Id", "assistant-one");
    }

    private static Fields fields() {
        return new Fields(new FieldValue("青禾公司", "甲方：青禾公司"), new FieldValue("星桥公司", "乙方：星桥公司"),
                new FieldValue("10000元", "金额：10000元"), null, null, null);
    }
}
