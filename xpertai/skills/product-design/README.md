# Product Design Skill Plugin

This Xpert plugin packages the Codex Product Design skill plugin as an installable Xpert skill bundle.

## Included Skills

- `product-design`: route Product Design setup, research, audit, ideation, prototype, URL clone, image-to-code, QA, and sharing requests.
- `user-context`: save and read Product Design user context from `$XPERTAI_HOME/state/plugins/product-design`.
- `get-context`: confirm the design brief before design or build work.
- `research`: research UX pain and workflow friction for a digital product.
- `audit`: audit product UX and design from captured screenshots.
- `ideate`: generate visual directions after brief confirmation.
- `prototype`: route prototype, redesign, clone, and UI build requests.
- `url-to-code`: clone a live URL into a runnable frontend prototype.
- `image-to-code`: build a responsive frontend from a selected visual target.
- `design-qa`: compare a coded prototype against its visual source.
- `share`: deploy a runnable prototype and return a shareable URL.

## Source

- Converted from `/examples/product-design/0.1.47`.
- Source Codex Product Design plugin version: `0.1.47`.
- Skill files, references, scripts, and the prototype template are preserved as closely as possible for Xpert installation.

## Xpert Packaging

- Bundle manifest: `.xpertai-plugin/plugin.json`
- Skill root: `skills`
- Xpert component keys: `product-design`, `user-context`, `get-context`, `research`, `audit`, `ideate`, `prototype`, `url-to-code`, `image-to-code`, `design-qa`, and `share`
- Bundled prototype starter: `templates/prototype`
- Prototype bootstrap script: `scripts/bootstrap-prototype.mjs`

## Runtime Requirements

- Declared middleware tool capabilities: `SandboxShell.sandbox_shell` plus `SandboxFile.sandbox_read_file`, `SandboxFile.sandbox_glob`, `SandboxFile.sandbox_grep`, `SandboxFile.sandbox_write_file`, `SandboxFile.sandbox_append_file`, `SandboxFile.sandbox_edit_file`, `SandboxFile.sandbox_multi_edit_file`, and `SandboxFile.sandbox_list_dir`.
- Required runtime: writable workspace filesystem, shell access, workspace dependency runtime, `node`, `npm`, and `python3`.
- Optional tools and integrations for full workflows: Browser, Chrome, Playwright, Figma, Canva, image generation, Sites, Vercel, or another deployment target.
