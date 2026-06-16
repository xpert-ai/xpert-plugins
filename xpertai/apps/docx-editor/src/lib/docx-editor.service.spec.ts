import { DocxEditorService } from './docx-editor.service.js'

describe('DocxEditorService', () => {
  it('can be constructed with repository dependencies', () => {
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => value),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn()
    }

    const service = new DocxEditorService(repository as never, repository as never, repository as never, repository as never)

    expect(service).toBeInstanceOf(DocxEditorService)
  })
})
