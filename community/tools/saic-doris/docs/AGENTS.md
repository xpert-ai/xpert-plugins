# SAIC Doris 文档维护

本目录由 `mint new docs --template product-guide` 初始化，使用 Mintlify MDX 和 `docs.json`。

- 使用中文解释配置和操作，保留代码中的工具名、参数名和返回字段。
- 文档范围仅含 SAIC 工具插件及其依赖的 Doris 适配器。
- 保持两种连接方式、24 个工具、资源 URI 与实现一致。
- 不包含真实主机、令牌、密码、客户数据或本机绝对路径。
- 区分自动测试、宿主验收与真实 Doris 验收；不将替身测试写成生产验证。
- 修改导航后确认每个页面存在；运行 `mint validate` 和 `mint broken-links`。
- 不自动打开浏览器或运行 `mint dev`。
