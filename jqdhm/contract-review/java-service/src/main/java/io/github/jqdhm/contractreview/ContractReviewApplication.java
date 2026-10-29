package io.github.jqdhm.contractreview;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import org.apache.coyote.http11.AbstractHttp11Protocol;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@EnableConfigurationProperties(ServiceProperties.class)
public class ContractReviewApplication {
    public static void main(String[] args) {
        SpringApplication.run(ContractReviewApplication.class, args);
    }

    @Bean
    Jackson2ObjectMapperBuilderCustomizer strictJson() {
        return builder -> builder.featuresToDisable(MapperFeature.ALLOW_COERCION_OF_SCALARS,
                        DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .featuresToEnable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .postConfigurer(mapper -> mapper.coercionConfigFor(LogicalType.Textual)
                        .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail));
    }

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> boundedUploads() {
        return factory -> factory.addConnectorCustomizers(connector -> {
            if (connector.getProtocolHandler() instanceof AbstractHttp11Protocol<?> protocol) {
                protocol.setDisableUploadTimeout(false);
                protocol.setConnectionUploadTimeout(10_000);
            }
        });
    }
}
