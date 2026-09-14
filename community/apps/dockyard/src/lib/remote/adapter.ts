import { z } from 'zod/v3'
import type { DockingManager, ObservableCollection } from '../../../vendor/dockyard/src/index.js'
import { optionsFromManager } from '../domain/layout.js'
import { revisionSchema, workspaceLoadSchema, workspaceStateSchema } from '../domain/contracts.js'
import type { BufferEntry, WorkspaceState } from '../domain/contracts.js'
import { HostBridge } from './bridge.js'
import { SaveQueue } from './save-queue.js'
import { configureLocale, t } from './i18n.js'

export type SourceItem = { ContentId: string; Title: string; message: string }
export type Sample = {
  openFile: (id: string) => void;
  manager: DockingManager; buffers: Map<string, string>; sourceDocuments: ObservableCollection<SourceItem>;
  getPreset: () => WorkspaceState['preset']; toast: (message: string) => void
}

const revisionReceipt = z.object({ revision: revisionSchema }).strict()
class WorkspaceAdapter {
  readonly bridge = new HostBridge()
  initial!: z.infer<typeof workspaceLoadSchema>
  layout!: SaveQueue<WorkspaceState>
  buffers!: SaveQueue<BufferEntry[]>
  scratchpad!: SaveQueue<string>
  private sample: Sample | null = null
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private removers: (() => void)[] = []
  private editedBuffers = false
  scratchpadText = ''

  async connect() {
    const config = await this.bridge.connect()
    configureLocale(config.locale)
    this.initial = await this.bridge.query(workspaceLoadSchema)
    this.scratchpadText = this.initial.scratchpad.text ?? ''
    const changed = () => this.updateStatus()
    this.layout = new SaveQueue(this.initial.workspace.revision, this.initial.workspace.state,
      (state, expectedRevision) => this.bridge.action('save_workspace', { state, expectedRevision }, revisionReceipt), changed)
    this.buffers = new SaveQueue(this.initial.buffers.revision, this.initial.buffers.items,
      (buffers, expectedRevision) => this.bridge.action('save_buffers', { buffers, expectedRevision }, revisionReceipt), changed)
    this.scratchpad = new SaveQueue(this.initial.scratchpad.revision, this.initial.scratchpad.text,
      (text, expectedRevision) => this.bridge.action('save_scratchpad', { text, expectedRevision }, revisionReceipt), changed)
    this.bridge.resize()
  }

  attach(sample: Sample) {
    this.sample = sample
    const schedule = () => {
      this.layout.set(this.currentState())
      if (this.layout.state !== 'error') this.debounce('layout', () => this.layout.flush())
    }
    this.removers.push(sample.manager.LayoutUpdated.add(schedule), sample.manager.ThemeChanged.add(schedule), sample.sourceDocuments.CollectionChanged.add(schedule))
    // Initial defaults only become saved after the host read succeeded and all factories were restored.
    schedule()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (this.editedBuffers || [this.layout, this.buffers, this.scratchpad].some(q => q.state !== 'saved')) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    this.removers.push(() => window.removeEventListener('beforeunload', beforeUnload))
    window.addEventListener('pagehide', () => this.dispose(), { once: true })
  }

  currentState(): WorkspaceState {
    if (!this.sample) throw new Error('not_initialized')
    return workspaceStateSchema.parse({
      layoutJson: this.sample.manager.SaveLayout('json'), theme: document.body.dataset.theme,
      preset: this.sample.getPreset(), options: optionsFromManager(this.sample.manager), sources: [...this.sample.sourceDocuments]
    })
  }

  private debounce(key: string, run: () => Promise<void>) {
    clearTimeout(this.timers.get(key))
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); void run().catch(() => this.updateStatus()) }, 700))
  }
  private cancelTimer(key: string) { clearTimeout(this.timers.get(key)); this.timers.delete(key) }

  async saveWorkspace() {
    this.cancelTimer('layout')
    this.layout.set(this.currentState())
    await this.layout.flush()
    if (this.scratchpad.state !== 'saved') { this.cancelTimer('scratchpad'); await this.scratchpad.flush() }
  }
  async saveBuffers(items: BufferEntry[]) {
    this.buffers.set(items)
    await this.buffers.flush()
    this.editedBuffers = !this.sample || this.sample.buffers.size !== items.length || items.some(item => this.sample!.buffers.get(item.contentId) !== item.text)
    this.updateStatus()
  }
  bufferEdited() { this.editedBuffers = true; this.updateStatus() }
  saveScratchpad(text: string) {
    this.scratchpadText = text
    this.scratchpad.set(text)
    if (this.scratchpad.state !== 'error') this.debounce('scratchpad', () => this.scratchpad.flush())
  }
  updateStatus() {
    const button = document.querySelector<HTMLButtonElement>('#status-save')
    if (!button || !this.layout) return
    const queues = [this.layout, this.buffers, this.scratchpad]
    const state = queues.some(q => q.state === 'error') ? 'error' : queues.some(q => q.state === 'saving') ? 'saving' : this.editedBuffers || queues.some(q => q.state === 'dirty') ? 'dirty' : 'saved'
    button.textContent = t(state === 'error' ? 'saveError' : state)
    button.title = t('saveWorkspace')
    button.dataset.state = state
  }
  showError(error: unknown) {
    const code = error instanceof Error ? error.message : ''
    this.sample?.toast(t(code === 'conflict' || code === 'local_changed' ? 'conflict' : 'error'))
  }
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.removers.forEach(remove => remove())
    this.removers = []; this.timers.clear(); this.bridge.dispose()
    this.sample?.manager.Dispose()
  }
}
export const adapter = new WorkspaceAdapter()
