package io.github.jqdhm.contractreview;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.nio.file.Path;
import java.util.UUID;

import static io.github.jqdhm.contractreview.ContractDtos.*;
import static org.assertj.core.api.Assertions.assertThat;

class PersistenceRestartTest {
    @TempDir Path directory;

    @Test
    void fileDatabaseRetainsContractAuditAndIdempotencyAcrossServiceRestart() {
        Scope scope = new Scope("tenant", "organization", "human", "assistant");
        Fields fields = new Fields(new FieldValue("Alpha", "甲方 Alpha"), new FieldValue("Beta", "乙方 Beta"),
                new FieldValue("100元", "金额 100元"), null, null, null);
        CreateRequest request = new CreateRequest("persist-request", "虚构合同", "甲方 Alpha；乙方 Beta；金额 100元", fields);
        Contract confirmed;
        try (var first = start()) {
            ContractService service = first.getBean(ContractService.class);
            Contract created = service.create(scope, request).contract();
            confirmed = service.confirm(scope, created.id(), new ConfirmRequest(created.version()));
        }
        try (var restarted = start()) {
            ContractService service = restarted.getBean(ContractService.class);
            assertThat(service.get(scope, confirmed.id())).isEqualTo(confirmed);
            CreateResult replay = service.create(scope, request);
            assertThat(replay.created()).isFalse();
            assertThat(replay.contract()).isEqualTo(confirmed);
            assertThat(service.confirm(scope, confirmed.id(), new ConfirmRequest(1L))).isEqualTo(confirmed);
        }
        assertThat(directory.resolve("contracts.mv.db")).exists();
    }

    @Test
    void localRequestBindingSurvivesRestartAndRejectsChangedOriginal() {
        Scope scope = new Scope("tenant", "organization", "human", "assistant");
        ExtractRequest request = new ExtractRequest("page-request", "持久化原文", "甲方 Alpha；乙方 Beta；金额 100元");
        String id;
        try (var first = start()) {
            ContractService service = first.getBean(ContractService.class);
            id = service.intake(scope, new IntakeRequest(request.title(), request.sourceText())).contract().id();
            assertThat(service.intakeExtraction(scope, request).contract().id()).isEqualTo(id);
        }
        try (var restarted = start()) {
            ContractService service = restarted.getBean(ContractService.class);
            assertThat(service.intakeExtraction(scope, request).contract().id()).isEqualTo(id);
            assertThat(service.intakeExtraction(scope, new ExtractRequest("refreshed-request", request.title(), request.sourceText()))
                    .contract().id()).isEqualTo(id);
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.intakeExtraction(scope,
                            new ExtractRequest(request.requestKey(), "改变标题", request.sourceText())))
                    .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code()).isEqualTo("IDEMPOTENCY_CONFLICT"));
        }
    }

    private ConfigurableApplicationContext start() {
        String database = "jdbc:h2:file:" + directory.resolve("contracts").toString().replace('\\', '/') + ";DB_CLOSE_ON_EXIT=FALSE";
        return new SpringApplicationBuilder(ContractReviewApplication.class).web(WebApplicationType.NONE)
                .bannerMode(Banner.Mode.OFF).run("--spring.datasource.url=" + database, "--spring.datasource.username=sa",
                        "--spring.datasource.password=", "--contract.service-token=" + UUID.randomUUID(),
                        "--logging.level.root=ERROR", "--spring.main.log-startup-info=false");
    }
}
