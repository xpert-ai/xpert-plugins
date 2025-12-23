# DeepSeek 插件测试

## 快速开始

### 1. 配置 API Key

1. 在项目根目录（`xpertai/`）创建 `.env` 文件：
   ```bash
   cd xpertai
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，填入你的 DeepSeek API Key：
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   ```

3. 获取 API Key：
   - 访问：https://platform.deepseek.com/api_keys
   - 创建或复制你的 API Key

**注意**：`.env` 文件已在根目录的 `.gitignore` 中，不会被提交到 Git

### 2. 运行测试

#### 简单测试脚本（推荐）

```bash
# 从 deepseek 插件目录运行
npx tsx test/test-developer-role-fix-simple.ts
```

#### Jest 单元测试

```bash
# 从项目根目录运行
npx nx test @cry0100/plugin-deepseek3.0 --testPathPatterns=test-developer-role-fix
```

## 测试文件说明

- **test-developer-role-fix-simple.ts**: 简单的独立测试脚本，易于运行
- **test-developer-role-fix.test.ts**: Jest 单元测试，适合 CI/CD
- **config.ts**: 测试配置文件（从根目录 .env 文件读取 API Key）
- **config.example.ts**: 配置文件示例（已废弃，仅作参考）

## 测试内容

测试会验证：

1. ✅ **System Message 处理**：确保 system message 不会转换为 developer role
2. ✅ **多轮对话**：测试包含 reasoning_content 的多轮对话
3. ✅ **流式响应**：测试流式响应是否正常工作
4. ✅ **安全检查**：验证代码中的安全检查是否生效

## 预期结果

### ✅ 成功情况

```
🧪 开始测试 deepseek-reasoner 模型...

📤 发送请求：
   Model: deepseek-reasoner
   Messages: [...]

⏳ 等待 API 响应...

✅ 测试成功！
📥 响应内容：
   [模型的实际响应]

✅ 没有出现 developer role 错误！修复成功！
```

### ❌ 失败情况

如果仍然报错，会看到：

```
❌ 测试失败！
   错误信息: 400 Failed to deserialize the JSON body into the target type: messages[0].role: unknown variant `developer`...

❌ 仍然出现 developer role 错误！
```

## 环境变量配置

测试从以下位置读取配置（按优先级）：

1. **根目录 `.env` 文件**（推荐）
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1  # 可选
   DEEPSEEK_TEST_TIMEOUT=30000  # 可选
   ```

2. **系统环境变量**
   ```bash
   export DEEPSEEK_API_KEY=your_api_key_here
   ```

## 注意事项

1. **配置文件安全**：
   - `.env` 文件已在根目录的 `.gitignore` 中，不会被提交
   - 不要将包含真实 API Key 的 `.env` 文件提交到 Git

2. **API 费用**：
   - 测试会实际调用 DeepSeek API
   - 可能会产生费用

3. **网络要求**：
   - 需要能够访问 `api.deepseek.com`

## 故障排查

### 问题：找不到 .env 文件

**解决方案**：
```bash
# 在项目根目录（xpertai/）创建 .env 文件
cd xpertai
echo "DEEPSEEK_API_KEY=your_api_key_here" > .env
```

### 问题：API Key 无效

**检查**：
- API Key 是否正确
- API Key 是否已过期
- API Key 是否有足够的权限

### 问题：仍然出现 developer role 错误

**可能原因**：
1. 平台仍在使用旧版本代码
2. 需要更新到最新版本

**解决方案**：
```bash
npm cache clean --force
npm uninstall @cry0100/plugin-deepseek3.0
npm install @cry0100/plugin-deepseek3.0@latest
```
