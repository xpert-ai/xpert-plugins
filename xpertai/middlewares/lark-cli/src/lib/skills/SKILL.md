---
name: lark-cli
description: "Interact with Lark/Feishu Open Platform using the official CLI tool. Use this skill when the user wants to manage calendar events, send messages, work with documents, manage spreadsheets, handle tasks, or interact with any Lark/Feishu business domain. Supports both user-level (OAuth) and bot-level (App ID/Secret) authentication."
---

# Lark CLI - Lark/Feishu Open Platform Integration

A command-line tool for Lark/Feishu Open Platform with 200+ commands and 19 AI Agent Skills covering Calendar, Messenger, Docs, Base, Sheets, Tasks, Mail, Meetings, and more.

## Installation

The Lark CLI is automatically installed in the sandbox via npm:

```bash
npm install -g @larksuite/cli
```

## Authentication

### User Mode (OAuth)

For user-level operations, use OAuth login:

```bash
# Interactive login with recommended scopes
lark-cli auth login --recommend

# Login with specific domain scopes
lark-cli auth login --domain calendar,messenger

# Check authentication status
lark-cli auth status
```

### Bot Mode (App ID/Secret)

For bot-level operations, configure App ID and Secret through middleware config. The credentials are securely provisioned in the sandbox.

## Available Skills

The following skills are downloaded from the larksuite/cli GitHub repository:

- `lark-shared` - App config, auth login, identity switching (auto-loaded)
- `lark-calendar` - Calendar events, agenda, free/busy queries
- `lark-im` - Send/reply messages, group chat management
- `lark-doc` - Create, read, update documents
- `lark-drive` - Upload, download files, manage permissions
- `lark-sheets` - Create, read, write spreadsheets
- `lark-base` - Tables, fields, records, dashboards
- `lark-task` - Tasks, task lists, subtasks
- `lark-mail` - Browse, search, send emails
- `lark-contact` - Search users, get profiles
- `lark-wiki` - Knowledge spaces, nodes
- `lark-event` - Real-time event subscriptions
- `lark-vc` - Meeting records, minutes
- `lark-whiteboard` - Whiteboard/chart rendering
- `lark-minutes` - Meeting minutes metadata
- `lark-openapi-explorer` - Explore underlying APIs
- `lark-skill-maker` - Custom skill creation
- `lark-workflow-meeting-summary` - Meeting summary workflow
- `lark-workflow-standup-report` - Standup report workflow

## Usage Examples

### Calendar

```bash
# View today's agenda
lark-cli calendar +agenda

# Create an event
lark-cli calendar +create --title "Team Meeting" --start "2024-01-15T10:00:00" --end "2024-01-15T11:00:00"
```

### Messenger

```bash
# Send a message to a chat
lark-cli im +messages-send --chat-id "oc_xxx" --text "Hello from AI Agent!"

# List recent chats
lark-cli im +chats
```

### Documents

```bash
# Create a document
lark-cli doc +create --title "Weekly Report" --markdown "# Progress\n- Completed feature X"

# Read a document
lark-cli doc +read --doc-id "doxcn_xxx"
```

### Sheets

```bash
# Read spreadsheet data
lark-cli sheets +read --spreadsheet-token "shtcn_xxx" --range "A1:D10"

# Write data to a sheet
lark-cli sheets +write --spreadsheet-token "shtcn_xxx" --range "A1" --values '[["Name", "Value"], ["Test", "123"]]'
```

## Identity Switching

Execute commands as user or bot:

```bash
# As user (default)
lark-cli calendar +agenda --as user

# As bot
lark-cli im +messages-send --as bot --chat-id "oc_xxx" --text "Bot message"
```

## Output Formats

```bash
# JSON output (default)
lark-cli calendar +agenda --format json

# Table format
lark-cli calendar +agenda --format table

# CSV format
lark-cli sheets +read --spreadsheet-token "xxx" --format csv
```

## Dry Run

Preview operations before executing:

```bash
lark-cli im +messages-send --chat-id "oc_xxx" --text "Test" --dry-run
```

## Troubleshooting

- `auth login` required: Run `lark-cli auth login --recommend` first
- Permission denied: Check if the required scopes are granted
- Command not found: Ensure `@larksuite/cli` is installed globally
- Network issues: Check internet connectivity for API calls

## Security Notes

- Credentials are securely stored in the OS keychain
- Bot credentials are provisioned via secure file upload
- Never hardcode secrets in commands
- Use `--dry-run` for potentially destructive operations
