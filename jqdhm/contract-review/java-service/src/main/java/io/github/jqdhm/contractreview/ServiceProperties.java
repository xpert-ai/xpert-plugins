package io.github.jqdhm.contractreview;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "contract")
public record ServiceProperties(String serviceToken) {
}
