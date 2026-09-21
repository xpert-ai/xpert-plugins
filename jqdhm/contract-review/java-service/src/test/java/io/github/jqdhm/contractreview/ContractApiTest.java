package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static io.github.jqdhm.contractreview.ContractDtos.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:contract-api-tests;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000"})
@AutoConfigureMockMvc
class ContractApiTest {
    private static final String TOKEN = UUID.randomUUID().toString();
    private static final Scope SCOPE = new Scope("tenant-one", "organization-one", "user-one", "assistant-one");
    private static final String SOURCE = "甲方：青禾咨询有限公司\n乙方：星桥工作室\n金额：10000元\n"
            + "生效日期：2026-09-01\n到期日期：2027-09-01\n付款条款：签署后10日内支付。\n追加金额：12000元";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry properties) {
        properties.add("contract.service-token", () -> TOKEN);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired ContractService service;

    @BeforeEach
    void resetDatabase() {
        jdbc.update("DELETE FROM contracts");
    }

    @Test
    void fullHumanReviewFlowPreservesSourceAndAudit() throws Exception {
        JsonNode created = create(request("flow"));
        String id = created.get("id").asText();
        assertThat(created.get("status").asText()).isEqualTo("DRAFT");
        assertThat(created.get("version").asInt()).isEqualTo(1);
        assertThat(created.get("audit").get(0).get("actorId").asText()).isEqualTo(SCOPE.userId());
        mvc.perform(scoped(get("/api/contracts/{id}/summary", id)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.containsString("待核对")));
        mvc.perform(scoped(put("/api/contracts/{id}", id)).content(json(new UpdateRequest(1L, changedFields()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.sourceText").value(SOURCE))
                .andExpect(jsonPath("$.audit[1].action").value("UPDATED"));
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content("{\"expectedVersion\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.version").value(3)).andExpect(jsonPath("$.audit.length()").value(3));
        mvc.perform(scoped(get("/api/contracts/{id}/summary", id)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.containsString("已人工确认")))
                .andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.containsString("不表示合同审批通过或法律有效")))
                .andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.containsString("12000元")));
        mvc.perform(scoped(put("/api/contracts/{id}", id)).content(json(new UpdateRequest(3L, fields()))))
                .andExpect(status().isConflict());
        assertThat(service.get(SCOPE, id).audit()).extracting(AuditEntry::action)
                .containsExactly(Action.CREATED, Action.UPDATED, Action.CONFIRMED);
    }

    @Test
    void createIsIdempotentAndRejectsChangedPayload() throws Exception {
        CreateRequest request = request("same-key");
        JsonNode first = create(request);
        mvc.perform(scoped(post("/api/contracts")).content(json(request)))
                .andExpect(status().isOk()).andExpect(content().json(first.toString()));
        mvc.perform(scoped(post("/api/contracts")).content(json(new CreateRequest(request.requestKey(),
                        "另一标题", SOURCE, fields()))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contracts", Integer.class)).isEqualTo(1);
    }

    @Test
    void repeatedConfirmationHasNoExtraAuditOrVersionChange() throws Exception {
        String id = create(request("repeat-confirm")).get("id").asText();
        String confirmed = mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content("{\"expectedVersion\":1}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content("{\"expectedVersion\":1}"))
                .andExpect(status().isOk()).andExpect(content().json(confirmed));
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content("{\"expectedVersion\":2}"))
                .andExpect(status().isConflict());
        assertThat(service.get(SCOPE, id).audit()).hasSize(2);
    }

    @Test
    void evidenceMustBeExactAndContainValue() throws Exception {
        for (FieldValue invalid : List.of(new FieldValue("青禾", "原文不存在的依据"),
                new FieldValue("伪造公司", "甲方：青禾咨询有限公司"))) {
            Fields fields = new Fields(invalid, fields().partyB(), fields().amount(), null, null, null);
            mvc.perform(scoped(post("/api/contracts")).content(json(new CreateRequest(UUID.randomUUID().toString(),
                            "证据校验", SOURCE, fields))))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("EVIDENCE_MISMATCH"));
        }
        String id = create(request("edit-evidence")).get("id").asText();
        Fields invalid = new Fields(new FieldValue("伪造", "伪造"), null, null, null, null, null);
        mvc.perform(scoped(put("/api/contracts/{id}", id)).content(json(new UpdateRequest(1L, invalid))))
                .andExpect(status().isUnprocessableEntity());
        assertThat(service.get(SCOPE, id).version()).isEqualTo(1);
    }

    @Test
    void draftAllowsMissingFieldsButConfirmationRequiresPartiesAndAmount() throws Exception {
        for (int missing = 0; missing < 3; missing++) {
            Fields incomplete = new Fields(missing == 0 ? null : fields().partyA(), missing == 1 ? null : fields().partyB(),
                    missing == 2 ? null : fields().amount(), null, null, null);
            JsonNode created = create(new CreateRequest("missing-" + missing, "待补全", SOURCE, incomplete));
            assertThat(created.get("warnings").size()).isEqualTo(4);
            mvc.perform(scoped(post("/api/contracts/{id}/confirm", created.get("id").asText())).content("{\"expectedVersion\":1}"))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REQUIRED_FIELDS_MISSING"));
        }
    }

    @Test
    void identicalPartiesCannotBeConfirmed() throws Exception {
        Fields identical = new Fields(fields().partyA(), fields().partyA(), fields().amount(), null, null, null);
        String id = create(new CreateRequest("same-parties", "同一主体", SOURCE, identical)).get("id").asText();
        mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content("{\"expectedVersion\":1}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("IDENTICAL_PARTIES"));
    }

    @Test
    void malformedUnknownAndOversizedValuesAreSafeErrors() throws Exception {
        ObjectNode valid = mapper.valueToTree(request("validation"));
        for (String field : List.of("requestKey", "title", "sourceText")) {
            ObjectNode invalid = valid.deepCopy();
            invalid.put(field, " ");
            mvc.perform(scoped(post("/api/contracts")).content(invalid.toString())).andExpect(status().isBadRequest());
        }
        for (var value : List.of(new String[]{"requestKey", "x".repeat(129)}, new String[]{"title", "x".repeat(121)},
                new String[]{"sourceText", "x".repeat(50_001)})) {
            ObjectNode invalid = valid.deepCopy();
            invalid.put(value[0], value[1]);
            mvc.perform(scoped(post("/api/contracts")).content(invalid.toString())).andExpect(status().isBadRequest());
        }
        valid.put("actorId", "forged-user");
        mvc.perform(scoped(post("/api/contracts")).content(valid.toString())).andExpect(status().isBadRequest());
        mvc.perform(scoped(post("/api/contracts")).content("{malformed"))
                .andExpect(status().isBadRequest()).andExpect(content().json("{\"code\":\"INVALID_REQUEST\",\"message\":\"请求格式或字段不合法。\"}"));
        mvc.perform(scoped(post("/api/contracts")).content("x".repeat(ApiSecurityFilter.MAX_BODY_BYTES + 1)))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("REQUEST_TOO_LARGE"));
    }

    @Test
    void versionsAndScalarTypesAreStrictAndSourceCannotBeEdited() throws Exception {
        String id = create(request("strict-update")).get("id").asText();
        for (String invalid : List.of("{}", "{\"expectedVersion\":0}", "{\"expectedVersion\":-1}",
                "{\"expectedVersion\":1.5}", "{\"expectedVersion\":\"1\"}", "{\"expectedVersion\":null}")) {
            mvc.perform(scoped(post("/api/contracts/{id}/confirm", id)).content(invalid)).andExpect(status().isBadRequest());
        }
        ObjectNode update = mapper.valueToTree(new UpdateRequest(1L, fields()));
        update.put("sourceText", "被替换的原文");
        mvc.perform(scoped(put("/api/contracts/{id}", id)).content(update.toString())).andExpect(status().isBadRequest());
        assertThat(service.get(SCOPE, id).sourceText()).isEqualTo(SOURCE);
        ObjectNode invalid = mapper.valueToTree(request("numeric-title"));
        invalid.put("title", 123);
        mvc.perform(scoped(post("/api/contracts")).content(invalid.toString())).andExpect(status().isBadRequest());
    }

    @Test
    void credentialsAndEveryScopeHeaderAreRequiredWhileHealthIsPublic() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(content().json("{\"status\":\"UP\"}"));
        mvc.perform(get("/api/contracts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/contracts").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        String[] names = {"X-Tenant-Id", "X-Organization-Id", "X-User-Id", "X-Assistant-Id"};
        for (int missing = 0; missing < names.length; missing++) {
            MockHttpServletRequestBuilder request = get("/api/contracts").header("Authorization", "Bearer " + TOKEN);
            for (int i = 0; i < names.length; i++) if (i != missing) request.header(names[i], "scope");
            mvc.perform(request).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_SCOPE"));
        }
        mvc.perform(scoped(get("/api/contracts"), new Scope(" ", "org", "user", "assistant")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void everyScopeDimensionIsIsolatedForReadWriteListAndSummary() throws Exception {
        String id = create(request("scope-key")).get("id").asText();
        for (Scope other : List.of(new Scope("other", SCOPE.organizationId(), SCOPE.userId(), SCOPE.assistantId()),
                new Scope(SCOPE.tenantId(), "other", SCOPE.userId(), SCOPE.assistantId()),
                new Scope(SCOPE.tenantId(), SCOPE.organizationId(), "other", SCOPE.assistantId()),
                new Scope(SCOPE.tenantId(), SCOPE.organizationId(), SCOPE.userId(), "other"))) {
            mvc.perform(scoped(get("/api/contracts/{id}", id), other)).andExpect(status().isNotFound());
            mvc.perform(scoped(get("/api/contracts/{id}/summary", id), other)).andExpect(status().isNotFound());
            mvc.perform(scoped(get("/api/contracts"), other)).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
            mvc.perform(scoped(put("/api/contracts/{id}", id), other).content(json(new UpdateRequest(1L, fields()))))
                    .andExpect(status().isNotFound());
            mvc.perform(scoped(post("/api/contracts/{id}/confirm", id), other).content("{\"expectedVersion\":1}"))
                    .andExpect(status().isNotFound());
            mvc.perform(scoped(post("/api/contracts"), other).content(json(request("scope-key")))).andExpect(status().isCreated());
        }
        mvc.perform(scoped(get("/api/contracts/not-present"))).andExpect(status().isNotFound());
    }

    @Test
    void listIsBoundedAndDoesNotExposeSourceFieldsOrAudit() throws Exception {
        for (int i = 0; i < 51; i++) service.create(SCOPE, request("list-" + i));
        mvc.perform(scoped(get("/api/contracts"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(50))
                .andExpect(jsonPath("$.items[0].sourceText").doesNotExist())
                .andExpect(jsonPath("$.items[0].fields").doesNotExist())
                .andExpect(jsonPath("$.items[0].audit").doesNotExist());
    }

    @Test
    void concurrentEditsHaveExactlyOneWinnerAndOneAuditEntry() throws Exception {
        String id = service.create(SCOPE, request("concurrent-edits")).contract().id();
        List<Integer> outcomes = concurrently(8, () -> {
            try {
                service.update(SCOPE, id, new UpdateRequest(1L, changedFields()));
                return 200;
            } catch (ApiException error) { return error.status(); }
        });
        assertThat(outcomes).filteredOn(code -> code == 200).hasSize(1);
        assertThat(outcomes).filteredOn(code -> code == 409).hasSize(7);
        Contract stored = service.get(SCOPE, id);
        assertThat(stored.version()).isEqualTo(2);
        assertThat(stored.audit()).extracting(AuditEntry::action).containsExactly(Action.CREATED, Action.UPDATED);
        assertThat(stored.fields().amount().value()).isEqualTo("12000元");
    }

    @Test
    void concurrentCreateReplaysWinnerWithoutDuplicateRowsOrAudits() throws Exception {
        List<CreateResult> results = concurrently(8, () -> service.create(SCOPE, request("concurrent-create")));
        assertThat(results).filteredOn(CreateResult::created).hasSize(1);
        assertThat(results.stream().map(result -> result.contract().id()).distinct()).hasSize(1);
        assertThat(results).allSatisfy(result -> assertThat(result.contract().audit()).hasSize(1));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM contracts", Integer.class)).isEqualTo(1);
    }

    @Test
    void concurrentConfirmationReplaysWithoutDuplicateAudit() throws Exception {
        String id = service.create(SCOPE, request("concurrent-confirm")).contract().id();
        List<Contract> results = concurrently(8, () -> service.confirm(SCOPE, id, new ConfirmRequest(1L)));
        assertThat(results).allSatisfy(contract -> {
            assertThat(contract.status()).isEqualTo(Status.CONFIRMED);
            assertThat(contract.version()).isEqualTo(2);
            assertThat(contract.audit()).hasSize(2);
        });
        assertThat(service.get(SCOPE, id).audit()).hasSize(2);
    }

    private static <T> List<T> concurrently(int count, Callable<T> work) throws Exception {
        CountDownLatch ready = new CountDownLatch(count);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<T>> futures = IntStream.range(0, count).mapToObj(ignored -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent start timed out");
                return work.call();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return futures.stream().map(future -> {
                try { return future.get(20, TimeUnit.SECONDS); }
                catch (Exception error) { throw new AssertionError("Concurrent request failed", error); }
            }).toList();
        }
    }

    private JsonNode create(CreateRequest request) throws Exception {
        return mapper.readTree(mvc.perform(scoped(post("/api/contracts")).content(json(request)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String json(Object value) throws Exception { return mapper.writeValueAsString(value); }

    private static MockHttpServletRequestBuilder scoped(MockHttpServletRequestBuilder request) {
        return scoped(request, SCOPE);
    }

    private static MockHttpServletRequestBuilder scoped(MockHttpServletRequestBuilder request, Scope scope) {
        return request.contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + TOKEN)
                .header("X-Tenant-Id", scope.tenantId()).header("X-Organization-Id", scope.organizationId())
                .header("X-User-Id", scope.userId()).header("X-Assistant-Id", scope.assistantId());
    }

    private static CreateRequest request(String key) { return new CreateRequest(key, "虚构咨询服务合同", SOURCE, fields()); }

    private static Fields fields() {
        return new Fields(new FieldValue("青禾咨询有限公司", "甲方：青禾咨询有限公司"),
                new FieldValue("星桥工作室", "乙方：星桥工作室"), new FieldValue("10000元", "金额：10000元"),
                new FieldValue("2026-09-01", "生效日期：2026-09-01"), new FieldValue("2027-09-01", "到期日期：2027-09-01"),
                new FieldValue("签署后10日内支付。", "付款条款：签署后10日内支付。"));
    }

    private static Fields changedFields() {
        Fields original = fields();
        return new Fields(original.partyA(), original.partyB(), new FieldValue("12000元", "追加金额：12000元"),
                original.effectiveDate(), original.expiryDate(), original.paymentTerms());
    }
}
