# Test Usage Guide

## 📋 Quick Start

### Step 1: Configure API Key

1. **Create `.env` file in project root directory (`xpertai/`)**:
   ```bash
   cd xpertai
   # If .env file doesn't exist, copy from .env.example
   cp .env.example .env
   ```

2. **Edit `.env` file and add your DeepSeek API Key**:
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   ```

3. **Get API Key**:
   - Visit: https://platform.deepseek.com/api_keys
   - Log in and create or copy your API Key

### Step 2: Run Tests

#### Method 1: Simple Test Script (Recommended)

```bash
# Run from deepseek plugin directory
cd xpertai/models/deepseek
npx tsx test/test-developer-role-fix-simple.ts
```

#### Method 2: Jest Unit Tests

```bash
# Run from project root directory
cd xpertai
npx nx test @cry0100/plugin-deepseek3.0 --testPathPatterns=test-developer-role-fix
```

#### Method 3: Verify .env File Loading

```bash
# Test if .env file is loaded correctly
cd xpertai/models/deepseek
npx tsx test/test-env-load.ts
```

## 📁 File Structure

```
test/
├── config.ts                    # Configuration file (reads from root .env)
├── config.example.ts            # Configuration example (deprecated, for reference only)
├── test-developer-role-fix-simple.ts  # Simple test script
├── test-developer-role-fix.test.ts    # Jest unit tests
├── test-env-load.ts             # .env file loading test
├── README.md                    # Detailed documentation (English)
├── USAGE.md                     # Usage guide (English)
└── .gitignore                   # Ignore config.ts (no longer needed)
```

## ✅ Test Coverage

Tests verify:

1. **System Message Handling**
   - Uses `deepseek-reasoner` model
   - Sends requests containing `system` messages
   - Verifies no `developer` role error occurs

2. **Multi-turn Conversations**
   - Tests multi-turn conversations with `reasoning_content`
   - Verifies `reasoning_content` is correctly passed

3. **Streaming Responses**
   - Tests if streaming responses work correctly

## 🎯 Expected Results

### ✅ Success

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

### ❌ Failure

If errors still occur:

```
❌ Test failed!
   Error: 400 Failed to deserialize the JSON body into the target type: messages[0].role: unknown variant `developer`...

❌ Developer role error still occurs!
```

## 🔒 Security Notes

- ✅ `.env` file is already in root directory's `.gitignore` and will not be committed to Git
- ✅ Do not commit files containing real API keys to version control
- ✅ If `.env` file is accidentally committed, immediately revert and update API Key

## 🌍 Environment Variable Configuration

Tests read configuration from the following locations (in priority order):

1. **Root directory `.env` file** (Recommended)
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1  # Optional
   DEEPSEEK_TEST_TIMEOUT=30000  # Optional
   ```

2. **System Environment Variables**
   ```bash
   # Windows PowerShell
   $env:DEEPSEEK_API_KEY="your_api_key_here"
   
   # Windows CMD
   set DEEPSEEK_API_KEY=your_api_key_here
   
   # Linux/Mac
   export DEEPSEEK_API_KEY=your_api_key_here
   ```

## 🐛 Common Issues

### Q: Cannot find .env file

**A**: Create `.env` file in project root directory (`xpertai/`):
```bash
cd xpertai
echo "DEEPSEEK_API_KEY=your_api_key_here" > .env
```

### Q: Invalid API Key

**A**: Check:
- Is the API Key copied correctly (no extra spaces)
- Has the API Key expired
- Does the API Key have sufficient permissions

### Q: Developer role error still occurs

**A**: Possible causes:
1. Platform is still using old version of code
2. Need to update to latest version

**Solution**:
```bash
npm cache clean --force
npm uninstall @cry0100/plugin-deepseek3.0
npm install @cry0100/plugin-deepseek3.0@latest
```

### Q: How to verify .env file is loaded correctly?

**A**: Run configuration loading test:
```bash
npx tsx test/test-env-load.ts
```

If you see:
```
✅ Configuration validation passed!
   .env file is loaded correctly and tests can be run
```

This means configuration is loaded correctly.

## 📝 Configuration Details

### .env File Location

- **Path**: `xpertai/.env`
- **Example File**: `xpertai/.env.example`
- **Git Status**: `.env` file will not be committed (already in `.gitignore`)

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | ✅ | - | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | ❌ | `https://api.deepseek.com/v1` | API Base URL |
| `DEEPSEEK_TEST_TIMEOUT` | ❌ | `30000` | Test timeout (milliseconds) |

### Configuration Loading Mechanism

1. `loadEnvFromRoot()` function in `test/config.ts` automatically finds the root directory's `.env` file
2. Parses `.env` file content (supports comments, empty lines, quotes, etc.)
3. If not found in `.env` file, reads from system environment variables
4. If still not found, uses default values

## 🎉 Start Testing

Now you understand how to configure and run tests, you can start testing!

1. ✅ Ensure `.env` file is created and contains API Key
2. ✅ Run tests to verify configuration is correct
3. ✅ Run full test suite to verify functionality

Happy testing! 🚀

