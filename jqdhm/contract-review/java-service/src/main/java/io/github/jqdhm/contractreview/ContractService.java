package io.github.jqdhm.contractreview;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static io.github.jqdhm.contractreview.ContractDtos.*;
import static io.github.jqdhm.contractreview.ContractRepository.StoredContract;

@Service
public class ContractService {
    private final ContractRepository repository;
    private final TransactionTemplate transactions;

    public ContractService(ContractRepository repository, PlatformTransactionManager manager) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setTimeout(10);
    }

    public CreateResult create(Scope scope, CreateRequest request) {
        ContractRules.validateEvidence(request.sourceText(), request.fields());
        String hash = fingerprint(repository.encode(request));
        var existing = repository.findByKey(scope, request.requestKey());
        if (existing.isPresent()) return replay(existing.get(), hash);
        Instant now = now();
        StoredContract contract = new StoredContract(UUID.randomUUID().toString(), request.title(), request.sourceText(),
                request.fields(), Status.DRAFT, 1, now, now, List.of(new AuditEntry(Action.CREATED, scope.userId(), now)), hash);
        try {
            transactions.executeWithoutResult(ignored -> repository.insert(scope, request.requestKey(), contract));
            return new CreateResult(contract.dto(), true);
        } catch (DuplicateKeyException concurrentCreate) {
            // Read after the failed insert transaction has rolled back; a concurrent winner owns this key.
            return replay(repository.findByKey(scope, request.requestKey()).orElseThrow(ApiException::conflict), hash);
        }
    }

    public Optional<CreateResult> replayExtraction(Scope scope, ExtractRequest request) {
        return repository.findByKey(scope, request.requestKey()).map(existing -> {
            // Compare immutable caller input, not a potentially nondeterministic model response.
            if (!existing.title().equals(request.title()) || !existing.sourceText().equals(request.sourceText())) {
                throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "请求标识已用于不同内容，请使用新的请求标识。");
            }
            return new CreateResult(existing.dto(), false);
        });
    }

    @Transactional(readOnly = true, timeout = 10)
    public Contract get(Scope scope, String id) {
        return require(scope, id).dto();
    }

    @Transactional(readOnly = true, timeout = 10)
    public ContractList list(Scope scope) {
        return new ContractList(repository.list(scope));
    }

    @Transactional(timeout = 10)
    public Contract update(Scope scope, String id, UpdateRequest request) {
        StoredContract current = require(scope, id);
        if (current.status() != Status.DRAFT || current.version() != request.expectedVersion()) {
            throw ApiException.conflict();
        }
        ContractRules.validateEvidence(current.sourceText(), request.fields());
        StoredContract next = changed(current, request.fields(), Status.DRAFT, Action.UPDATED, scope.userId());
        if (!repository.update(scope, next, request.expectedVersion())) throw ApiException.conflict();
        return next.dto();
    }

    @Transactional(timeout = 10)
    public Contract confirm(Scope scope, String id, ConfirmRequest request) {
        StoredContract current = require(scope, id);
        if (isConfirmationReplay(current, request.expectedVersion())) return current.dto();
        if (current.status() != Status.DRAFT || current.version() != request.expectedVersion()) {
            throw ApiException.conflict();
        }
        ContractRules.validateConfirmation(current.fields());
        StoredContract next = changed(current, current.fields(), Status.CONFIRMED, Action.CONFIRMED, scope.userId());
        if (!repository.update(scope, next, request.expectedVersion())) {
            StoredContract winner = require(scope, id);
            if (isConfirmationReplay(winner, request.expectedVersion())) return winner.dto();
            throw ApiException.conflict();
        }
        return next.dto();
    }

    @Transactional(readOnly = true, timeout = 10)
    public Summary summary(Scope scope, String id) {
        Contract contract = require(scope, id).dto();
        return new Summary(contract.status(), ContractRules.summary(contract));
    }

    private StoredContract require(Scope scope, String id) {
        return repository.find(scope, id).orElseThrow(() -> new ApiException(404, "NOT_FOUND", "记录不存在。"));
    }

    private static boolean isConfirmationReplay(StoredContract current, long expectedVersion) {
        return current.status() == Status.CONFIRMED && expectedVersion == current.version() - 1;
    }

    private static CreateResult replay(StoredContract existing, String hash) {
        if (!existing.payloadHash().equals(hash)) {
            throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "请求标识已用于不同内容，请使用新的请求标识。");
        }
        return new CreateResult(existing.dto(), false);
    }

    private static StoredContract changed(StoredContract current, Fields fields, Status status, Action action, String actor) {
        Instant now = now();
        List<AuditEntry> audit = new ArrayList<>(current.audit());
        audit.add(new AuditEntry(action, actor, now));
        return new StoredContract(current.id(), current.title(), current.sourceText(), fields, status,
                Math.incrementExact(current.version()), current.createdAt(), now, List.copyOf(audit), current.payloadHash());
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    private static String fingerprint(String canonicalPayload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonicalPayload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
