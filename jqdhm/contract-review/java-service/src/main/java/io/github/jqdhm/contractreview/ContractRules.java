package io.github.jqdhm.contractreview;

import java.util.ArrayList;
import java.util.List;

import static io.github.jqdhm.contractreview.ContractDtos.*;

final class ContractRules {
    private static final String[] LABELS = {"甲方", "乙方", "金额", "生效日期", "到期日期", "付款条款"};

    private ContractRules() { }

    static void validateEvidence(String source, Fields fields) {
        for (FieldValue field : values(fields)) {
            if (field != null && (!source.contains(field.evidence()) || !field.evidence().contains(field.value()))) {
                throw new ApiException(422, "EVIDENCE_MISMATCH", "字段值与原文依据不一致，请核对原文。");
            }
        }
    }

    static void validateConfirmation(Fields fields) {
        if (fields.partyA() == null || fields.partyB() == null || fields.amount() == null) {
            throw new ApiException(422, "REQUIRED_FIELDS_MISSING", "确认前必须填写甲方、乙方和金额及其原文依据。");
        }
        if (sameParties(fields)) {
            throw new ApiException(422, "IDENTICAL_PARTIES", "甲方和乙方不能相同。");
        }
    }

    static List<String> warnings(Fields fields) {
        List<String> warnings = new ArrayList<>();
        FieldValue[] values = values(fields);
        for (int i = 0; i < values.length; i++) {
            if (values[i] == null) warnings.add("缺少" + LABELS[i] + "，请核对原文。");
        }
        if (sameParties(fields)) warnings.add("甲方和乙方相同，请核对原文。");
        return List.copyOf(warnings);
    }

    static String summary(Contract contract) {
        StringBuilder result = new StringBuilder(contract.title()).append('\n');
        result.append(contract.status() == Status.CONFIRMED ? "状态：已人工确认" : "状态：待核对（草稿）").append('\n');
        FieldValue[] values = values(contract.fields());
        for (int i = 0; i < values.length; i++) {
            result.append(LABELS[i]).append("：").append(values[i] == null ? "未提供" : values[i].value()).append('\n');
        }
        if (!contract.warnings().isEmpty()) {
            result.append("核对提示：").append(String.join(" ", contract.warnings())).append('\n');
        }
        return result.append("本摘要仅用于资料整理；人工确认不表示合同审批通过或法律有效。").toString();
    }

    private static FieldValue[] values(Fields fields) {
        return new FieldValue[]{fields.partyA(), fields.partyB(), fields.amount(), fields.effectiveDate(),
                fields.expiryDate(), fields.paymentTerms()};
    }

    private static boolean sameParties(Fields fields) {
        return fields.partyA() != null && fields.partyB() != null
                && fields.partyA().value().strip().equals(fields.partyB().value().strip());
    }
}
