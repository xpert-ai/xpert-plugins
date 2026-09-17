# Architecture

## Separation of responsibilities

`events.js` implements signals, observable properties, typed owner-aware collections, GridLength and commands. `model.js` implements a headless layout tree and invariants. `manager.js` coordinates changes, insertion strategies, visibility, sources, history and content identity. `serialization.js` converts layout metadata to strict JSON/XML and rebinds content. `items.js` exposes command-oriented adapters over content models.

`view.js` and `dom.js` implement the actual browser renderer and interactions. `controls.js` exposes DOM-backed control adapters. `themes.js` and `avalondock.css` provide original visual themes. `web-component.js` supplies declarative HTML and custom-element lifecycle. `index.js` combines the public exports.

The sample is an ordinary consumer of that library. It is not embedded in the core manager. `sample/minimal.html` demonstrates a smaller consumer with no Dockyard shell.

## Data flow

A model change first validates/coerces its value, emits notifications, and informs its manager. Structural collections validate types/ownership and update parent relationships. The manager batches mutations, normalizes layout invariants, records a layout snapshot when history is enabled, and schedules a view update. Explicit synchronous transactions collect several edits into one history entry and roll back on failure.

The renderer reconciles keyed panes, tabs, rails, floating shells and content holders. Layout wrappers may change after deserialization; content is resolved by stable ContentId. Body factories run lazily and their resulting DOM is retained. Existing bodies are parked in the connected host before obsolete shells are removed. Where `Element.moveBefore` is supported, same-document moves retain state that ordinary removal/reinsertion can lose, including the tested Chromium iframe context. Older-browser fallback semantics differ.

CSS flex sizing represents nested panel/pane groups. Splitters measure actual sizes, apply bounded pixel changes during interaction, and commit once when resizing ends. Geometry reads and deferred renders are localized, but this implementation is not an asymptotically optimized scene graph: large collections still have linear validation/reconciliation work and some uniqueness checks are quadratic during bulk insertion. The 500-tab test verifies a practical bounded workload, not a universal throughput guarantee.

## Pointer and keyboard operations

PointerEvents feed a drag coordinator with a movement threshold. It tracks source content/group, eligible pane/root targets, insertion positions and a docking preview. Releasing commits the chosen model operation. Escape/pointer cancellation clears visual state without an incomplete layout edit. Control suspends docking to allow floating. Floating movement/resizing and splitters use their own bounded interaction state.

Keyboard handling supplies tab navigation, splitter resize, MRU selection, menu navigation and pane traversal. Interactive content retains its normal browser editing behavior. Focused content is not redrawn as bitmap text.

## Ownership and lifecycle

A root can belong to one manager. Moving content within its tree preserves ContentId and hosted content. Explicit transfer coordinates two manager snapshots; pointer dragging across managers is outside the implemented contract. IDs are checked before live mutation to prevent ambiguous restoration and DOM lookup.

The registry may retain closed content for history. Releasing closed content is explicit. Factories can return a dispose hook; changing content/templates, permanently releasing content, detaching the view or disposing the manager runs cleanup. Undo restores the layout, not editor buffers or source-object side effects. Applications should keep business state outside the layout and provide their own persistence/undo where needed.

## Serialization and trust

JSON uses an explicit format/version envelope and allowlisted layout types/properties. XML parses the common AvalonDock layout shape without DTD resolution, custom entity processing, arbitrary constructor lookup or executable content. Input text is limited to 4,194,304 JavaScript characters; node/depth limits default to 10,000/64. This is a text-length guard, not an exact UTF-8 byte quota.

Templates/factories are trusted application functions. Text and plain data are rendered as text. IconSource URLs may request images; applications accepting untrusted icons should constrain allowed sources or supply an IconContentTemplate. Layout input does not make arbitrary application code or DOM safe. Neither the component nor the sample is a security-audited multi-tenant platform.

## Packaging

The build script packs this project's static ES-module forms into a classic browser bundle, then embeds that bundle, styles and a strict-mode sample into standalone.html. Unsupported module syntax fails the packer rather than being silently discarded. This is a local project packer, not a general JavaScript bundler.

Both the classic output and native ES-module graph are browser-tested. No runtime framework, third-party icon font, remote asset, or generated source dependency is needed for the shipped sample.
