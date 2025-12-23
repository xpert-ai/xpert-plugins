# Test Checklist

## ✅ Completed

- [x] Create test folder
- [x] Create configuration file `config.ts` (for API Key)
- [x] Create configuration example file `config.example.ts`
- [x] Move test files to test folder
- [x] Update test files to use configuration file
- [x] Configure .gitignore to ensure config.ts is not committed
- [x] Update tsconfig.spec.json to include test folder

## 📝 To Do

### Step 1: Configure API Key

1. Create `.env` file in project root directory (`xpertai/`)
2. Add your DeepSeek API Key to the `.env` file:
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   ```

### Step 2: Run Tests

```bash
# Run from deepseek plugin directory
npx tsx test/test-developer-role-fix-simple.ts
```

## 📁 File Structure

```
test/
├── config.ts                    # ✅ Configuration file (reads from .env)
├── config.example.ts            # ✅ Configuration example
├── test-developer-role-fix-simple.ts  # ✅ Simple test script
├── test-developer-role-fix.test.ts    # ✅ Jest unit tests
├── README.md                    # ✅ Detailed documentation
├── USAGE.md                     # ✅ Usage guide (English)
└── .gitignore                   # ✅ Ignore config.ts
```

## 🔍 Verification Steps

1. **Confirm configuration file exists**
   ```bash
   ls test/config.ts
   ```

2. **Confirm API Key is set**
   ```bash
   # Check if DEEPSEEK_API_KEY is set in .env file
   grep "DEEPSEEK_API_KEY" xpertai/.env
   ```

3. **Run tests**
   ```bash
   npx tsx test/test-developer-role-fix-simple.ts
   ```

## 🎯 Test Goals

Verify `deepseek-reasoner` model:
- ✅ No `developer` role error occurs
- ✅ Can handle system messages correctly
- ✅ Can handle multi-turn conversations correctly
- ✅ Can handle streaming responses correctly

