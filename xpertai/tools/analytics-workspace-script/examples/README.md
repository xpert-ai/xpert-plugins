# 销售订单验收数据

这是可重复的合成测试夹具，不是真实业务事实。上传 `orders.csv` 和本文件至测试 Assistant 的 `acceptance/` 目录。

每行一笔订单。`ordered_at` 为订单日期，`region` 为区域；`status=paid` 为已支付，`cancelled` 为取消。净销售额等于 `paid_amount_cny-refund_amount_cny`，仅计已支付订单。金额单位人民币元，按订单日期所属月份归属。

验收请求只说明来源、业务需求、脚本语言、筛选和刷新，不把正确结果或查询代码提供给模型。独立断言见 `docs/acceptance.md`。
