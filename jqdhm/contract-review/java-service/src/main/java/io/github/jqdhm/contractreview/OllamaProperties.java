package io.github.jqdhm.contractreview;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.net.URI;
import java.util.Set;

@ConfigurationProperties(prefix = "contract.ollama")
public record OllamaProperties(URI baseUrl, String model, int timeoutSeconds) {
    public OllamaProperties {
        if (baseUrl == null || !"http".equals(baseUrl.getScheme())
                || !Set.of("127.0.0.1", "localhost", "[::1]").contains(baseUrl.getHost())
                || baseUrl.getRawUserInfo() != null || baseUrl.getRawQuery() != null || baseUrl.getRawFragment() != null
                || !(baseUrl.getPath().isEmpty() || baseUrl.getPath().equals("/"))) {
            throw new IllegalArgumentException("Local extraction requires a loopback Ollama HTTP base URL");
        }
        if (model == null || model.isBlank() || model.length() > 128
                || timeoutSeconds < 1 || timeoutSeconds > 180) {
            throw new IllegalArgumentException("Local extraction requires a local model and a 1-180 second timeout");
        }
    }
}
