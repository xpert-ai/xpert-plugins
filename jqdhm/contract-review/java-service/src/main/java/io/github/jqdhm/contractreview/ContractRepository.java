package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static io.github.jqdhm.contractreview.ContractDtos.*;

@Repository
public class ContractRepository {
    private static final String SCOPE = "tenant_id = :tenant AND organization_id = :organization AND user_id = :user AND assistant_id = :assistant";
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ContractRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public Optional<StoredContract> find(Scope scope, String id) {
        return jdbc.query("SELECT * FROM contracts WHERE " + SCOPE + " AND id = :id",
                scoped(scope).addValue("id", id), this::read).stream().findFirst();
    }

    public Optional<StoredContract> findByKey(Scope scope, String key) {
        return jdbc.query("SELECT * FROM contracts WHERE " + SCOPE + " AND request_key = :key",
                scoped(scope).addValue("key", key), this::read).stream().findFirst();
    }

    public List<ListItem> list(Scope scope) {
        return jdbc.query("SELECT id, title, status, version, updated_at, fields_json FROM contracts WHERE " + SCOPE
                        + " ORDER BY updated_at DESC, id DESC LIMIT 50", scoped(scope), (rs, row) ->
                new ListItem(rs.getString("id"), rs.getString("title"), Status.valueOf(rs.getString("status")),
                        rs.getLong("version"), instant(rs, "updated_at"),
                        ContractRules.warnings(decode(rs.getString("fields_json"), new TypeReference<Fields>() { }))));
    }

    public void insert(Scope scope, String key, StoredContract contract) {
        jdbc.update("""
                INSERT INTO contracts (id, tenant_id, organization_id, user_id, assistant_id, request_key,
                  payload_hash, title, source_text, fields_json, status, version, created_at, updated_at, audit_json)
                VALUES (:id, :tenant, :organization, :user, :assistant, :key, :hash, :title, :source,
                  :fields, :status, :version, :created, :updated, :audit)
                """, values(scope, contract).addValue("key", key));
    }

    public boolean update(Scope scope, StoredContract contract, long expectedVersion) {
        return jdbc.update("UPDATE contracts SET fields_json = :fields, status = :status, version = :version, "
                        + "updated_at = :updated, audit_json = :audit WHERE " + SCOPE
                        + " AND id = :id AND version = :expected AND status = 'DRAFT'",
                values(scope, contract).addValue("expected", expectedVersion)) == 1;
    }

    public String encode(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Cannot encode contract data", error);
        }
    }

    private MapSqlParameterSource values(Scope scope, StoredContract contract) {
        return scoped(scope).addValue("id", contract.id()).addValue("hash", contract.payloadHash())
                .addValue("title", contract.title()).addValue("source", contract.sourceText())
                .addValue("fields", encode(contract.fields())).addValue("status", contract.status().name())
                .addValue("version", contract.version()).addValue("created", contract.createdAt().atOffset(ZoneOffset.UTC))
                .addValue("updated", contract.updatedAt().atOffset(ZoneOffset.UTC)).addValue("audit", encode(contract.audit()));
    }

    private MapSqlParameterSource scoped(Scope scope) {
        return new MapSqlParameterSource().addValue("tenant", scope.tenantId()).addValue("organization", scope.organizationId())
                .addValue("user", scope.userId()).addValue("assistant", scope.assistantId());
    }

    private StoredContract read(ResultSet rs, int row) throws SQLException {
        return new StoredContract(rs.getString("id"), rs.getString("title"), rs.getString("source_text"),
                decode(rs.getString("fields_json"), new TypeReference<Fields>() { }),
                Status.valueOf(rs.getString("status")), rs.getLong("version"), instant(rs, "created_at"),
                instant(rs, "updated_at"), decode(rs.getString("audit_json"), new TypeReference<List<AuditEntry>>() { }),
                rs.getString("payload_hash"));
    }

    private <T> T decode(String json, TypeReference<T> type) {
        try {
            return mapper.readValue(json, type);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Cannot decode stored contract data", error);
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }

    public record StoredContract(String id, String title, String sourceText, Fields fields, Status status,
                                  long version, Instant createdAt, Instant updatedAt, List<AuditEntry> audit,
                                  String payloadHash) {
        public Contract dto() {
            return new Contract(id, title, sourceText, fields, status, version, ContractRules.warnings(fields),
                    createdAt, updatedAt, audit);
        }
    }
}
