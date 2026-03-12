# @community/middlewares-pii

PII (Personally Identifiable Information) detection and redaction middleware for XpertAI agents.

## Features

- **Built-in PII detectors**: SSN, email, phone numbers, credit card numbers, IP addresses
- **Custom detectors**: Define your own PII detection logic
- **Multiple redaction strategies**: Hash, mask, remove, or replace with custom text
- **Configurable detection scope**: Detect in user input, AI output, or both
- **State tracking**: Track PII detection counts by type

## Installation

```bash
pnpm add @community/middlewares-pii
```

## Usage

### Basic Usage with Built-in Detector

```typescript
import { createAgent } from '@xpert-ai/agent-sdk';
import { piiMiddleware } from '@community/middlewares-pii';

const agent = createAgent({
  model: "gpt-4",
  tools: [],
  middleware: [
    piiMiddleware({
      piiType: "ssn",
      strategy: "hash",
      detectIn: ["both"],
    }),
  ],
});
```

### Custom Detector Function

```typescript
function detectCustomPII(content: string): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const pattern = /\b[A-Z]{2}\d{6}\b/g; // Example: AB123456 format
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    matches.push({
      text: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      type: "custom_id",
    });
  }
  return matches;
}

const agent = createAgent({
  model: "gpt-4",
  tools: [],
  middleware: [
    piiMiddleware({
      piiType: "custom",
      detector: detectCustomPII,
      strategy: "mask",
      maskChar: "#",
      maskLength: 3,
    }),
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `piiType` | `string` | `"custom"` | Type of PII to detect: `"ssn"`, `"email"`, `"phone"`, `"credit_card"`, `"ip_address"`, or `"custom"` |
| `detector` | `PiiDetector` | - | Custom detector function (required when `piiType` is `"custom"`) |
| `strategy` | `"hash" \| "mask" \| "remove" \| "replace"` | `"hash"` | Redaction strategy |
| `replacementText` | `string` | `"[REDACTED]"` | Text to use when strategy is `"replace"` |
| `maskChar` | `string` | `"*"` | Character to use for masking |
| `maskLength` | `number` | `4` | Number of characters to mask |
| `hashAlgorithm` | `"sha256" \| "sha1" \| "md5"` | `"sha256"` | Hash algorithm for hash strategy |
| `detectIn` | `Array<"input" \| "output" \| "both">` | `["both"]` | Where to detect PII |
| `enabled` | `boolean` | `true` | Enable or disable PII detection |

## Redaction Strategies

### Hash Strategy
Replaces PII with a hash value. Example: `"123-45-6789"` → `"[HASH:a1b2c3d4]"`

### Mask Strategy
Partially masks PII while keeping some characters visible. Example: `"john.doe@example.com"` → `"john.doe@exa***.com"`

### Remove Strategy
Completely removes PII from the text.

### Replace Strategy
Replaces PII with custom text. Example: `"123-45-6789"` → `"[REDACTED]"`

## Built-in Detectors

### SSN Detector
Detects US Social Security Numbers in `XXX-XX-XXXX` format with validation (excludes invalid prefixes like 000, 666, 900-999).

### Email Detector
Detects email addresses using standard email pattern matching.

### Phone Detector
Detects phone numbers in various formats including international and US formats.

### Credit Card Detector
Detects credit card numbers (16-digit and 15-digit Amex formats).

### IP Address Detector
Detects IPv4 addresses with octet validation.

## API Reference

### Types

```typescript
interface PiiMatch {
  text: string;
  start: number;
  end: number;
  type: string;
}

type PiiDetector = (content: string) => PiiMatch[];
type RedactionStrategy = "hash" | "mask" | "remove" | "replace";
type BuiltInPiiType = "ssn" | "email" | "phone" | "credit_card" | "ip_address";
```

### Functions

- `piiMiddleware(config: PiiMiddlewareConfig)`: Creates a PII middleware instance

## Development

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Lint
```bash
pnpm lint
```

## License

MIT
