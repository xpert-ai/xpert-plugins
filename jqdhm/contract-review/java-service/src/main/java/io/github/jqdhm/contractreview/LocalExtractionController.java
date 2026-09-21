package io.github.jqdhm.contractreview;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import static io.github.jqdhm.contractreview.ContractDtos.*;

@RestController
@Profile("local-extraction")
@EnableConfigurationProperties(OllamaProperties.class)
public class LocalExtractionController {
    private final LocalExtractionService service;

    public LocalExtractionController(LocalExtractionService service) {
        this.service = service;
    }

    @PostMapping("/api/contracts/extract")
    public ResponseEntity<Contract> extract(@RequestAttribute(Scope.REQUEST_ATTRIBUTE) Scope scope,
                                            @RequestBody ExtractRequest request) {
        CreateResult result = service.extract(scope, request);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.contract());
    }
}
