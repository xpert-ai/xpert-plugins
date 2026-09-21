package io.github.jqdhm.contractreview;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static io.github.jqdhm.contractreview.ContractDtos.*;

@RestController
@RequestMapping
public class ContractController {
    private final ContractService service;

    public ContractController(ContractService service) {
        this.service = service;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }

    @PostMapping("/api/contracts")
    public ResponseEntity<Contract> create(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope,
                                           @Valid @RequestBody CreateRequest request) {
        CreateResult result = service.create(scope, request);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.contract());
    }

    @GetMapping("/api/contracts")
    public ContractList list(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope) {
        return service.list(scope);
    }

    @GetMapping("/api/contracts/{id}")
    public Contract get(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope, @PathVariable String id) {
        return service.get(scope, id);
    }

    @PutMapping("/api/contracts/{id}")
    public Contract update(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope, @PathVariable String id,
                           @Valid @RequestBody UpdateRequest request) {
        return service.update(scope, id, request);
    }

    @PostMapping("/api/contracts/{id}/confirm")
    public Contract confirm(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope, @PathVariable String id,
                            @Valid @RequestBody ConfirmRequest request) {
        return service.confirm(scope, id, request);
    }

    @GetMapping("/api/contracts/{id}/summary")
    public Summary summary(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope, @PathVariable String id) {
        return service.summary(scope, id);
    }
}
