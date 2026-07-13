import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentDirectory = join(dirname(fileURLToPath(import.meta.url)), 'components')

describe('Pencil Workbench action placement', () => {
  const readComponent = (name: string) => readFileSync(join(componentDirectory, name), 'utf8')

  it('keeps Save Version in the New menu instead of the toolbar', () => {
    const createMenu = readComponent('CreateDocumentMenu.vue')
    const toolbar = readComponent('TopToolbar.vue')

    expect(createMenu).toContain("emit('saveVersion')")
    expect(createMenu).toContain('<PencilIcon name="history" />')
    expect(toolbar).not.toContain('<ToolbarButton icon="history"')
  })

  it('keeps export controls in the Share dialog and uses the share glyph in the toolbar', () => {
    const shareDialog = readComponent('ShareDesignDialog.vue')
    const toolbar = readComponent('TopToolbar.vue')

    expect(shareDialog).toContain("emit('update:exportFormat', value)")
    expect(shareDialog).toContain("emit('export')")
    expect(toolbar).toContain('<ToolbarButton icon="share"')
    expect(toolbar).not.toContain('<ToolbarButton icon="download"')
  })
})
