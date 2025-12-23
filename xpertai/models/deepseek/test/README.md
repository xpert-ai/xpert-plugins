# DeepSeek Plugin Testing

## Quick Start

### 1. Configure API Key

1. Create a `.env` file in the project root directory (`xpertai/`):
   ```bash
   cd xpertai
   cp .env.example .env
   ```

2. Edit the `.env` file and add your DeepSeek API Key:
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   ```

3. Get your API Key:
   - Visit: https://platform.deepseek.com/api_keys
   - Create or copy your API Key

**Note**: The `.env` file is already in the root directory's `.gitignore` and will not be committed to Git

### 2. Run Tests

#### Simple Test Script (Recommended)

```bash
# Run from the deepseek plugin directory
npx tsx test/test-developer-role-fix-simple.ts
```

#### Jest Unit Tests

```bash
# Run from the project root directory
npx nx test @cry0100/plugin-deepseek3.0 --testPathPatterns=test-developer-role-fix
```

## Test Files

- **test-developer-role-fix-simple.ts**: Simple standalone test script, easy to run
- **test-developer-role-fix.test.ts**: Jest unit tests, suitable for CI/CD
- **config.ts**: Test configuration file (reads API Key from root `.env` file)
- **config.example.ts**: Configuration example (deprecated, for reference only)

## Test Coverage

Tests verify:

1. ✅ **System Message Handling**: Ensures system messages are not converted to developer role
2. ✅ **Multi-turn Conversations**: Tests multi-turn conversations with reasoning_content
3. ✅ **Streaming Responses**: Tests if streaming responses work correctly
4. ✅ **Safety Checks**: Verifies that safety checks in the code are working

## Expected Results

### ✅ Success Case

```
🧪 Starting test for deepseek-reasoner model...

📤 Sending request:
   Model: deepseek-reasoner
   Messages: [...]

⏳ Waiting for API response...

✅ Test successful!
📥 Response content:
   [Actual model response]

✅ No developer role error occurred! Fix successful!
```

### ❌ Failure Case

If errors still occur, you will see:

```
❌ Test failed!
   Error: 400 Failed to deserialize the JSON body into the target type: messages[0].role: unknown variant `developer`...

❌ Developer role error still occurs!
```

## Environment Variable Configuration

Tests read configuration from the following locations (in priority order):

1. **Root directory `.env` file** (Recommended)
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1  # Optional
   DEEPSEEK_TEST_TIMEOUT=30000  # Optional
   ```

2. **System Environment Variables**
   ```bash
   export DEEPSEEK_API_KEY=your_api_key_here
   ```

## Notes

1. **Configuration File Security**:
   - The `.env` file is already in the root directory's `.gitignore` and will not be committed
   - Do not commit `.env` files containing real API keys to Git

2. **API Costs**:
   - Tests will actually call the DeepSeek API
   - May incur costs

3. **Network Requirements**:
   - Must be able to access `api.deepseek.com`

## Troubleshooting

### Issue: Cannot find .env file

**Solution**:
```bash
# Create .env file in project root directory (xpertai/)
cd xpertai
echo "DEEPSEEK_API_KEY=your_api_key_here" > .env
```

### Issue: Invalid API Key

**Check**:
- Is the API Key correct
- Has the API Key expired
- Does the API Key have sufficient permissions

### Issue: Developer role error still occurs

**Possible Causes**:
1. Platform is still using old version of code
2. Need to update to latest version

**Solution**:
```bash
npm cache clean --force
npm uninstall @cry0100/plugin-deepseek3.0
npm install @cry0100/plugin-deepseek3.0@latest
```
