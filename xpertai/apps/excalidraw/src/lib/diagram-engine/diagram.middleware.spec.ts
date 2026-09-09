import { describeXpertToolProvider, DecoratedToolsetStrategy, type ToolExecutionContext } from '@xpert-ai/plugin-sdk'
import { providerFixture } from '../tools/provider-test-fixture.js'
import { EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,EXCALIDRAW_DIAGRAM_TOOL_NAMES } from '../tools/diagram-contracts.js'
const context:ToolExecutionContext={source:'mcp',tenantId:'tenant',organizationId:'org',principal:{type:'user',id:'user',userId:'user'},executionId:'exec',requestId:'request',host:{}}
describe('Diagram engine decorated tools',()=>{
  it('preserves the technical middleware group and declares validate as a write',()=>{
    const descriptor=describeXpertToolProvider(providerFixture().provider)
    const tools=descriptor.tools.filter(item=>item.options.middleware===EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME)
    expect(tools.map(item=>item.options.name).sort()).toEqual([...EXCALIDRAW_DIAGRAM_TOOL_NAMES].sort())
    expect(tools.find(item=>item.options.name==='excalidraw_diagram_validate').options.mcp).toMatchObject({behavior:{risk:'write'}})
  })
  it('rejects quality rendering when authenticated file storage is unavailable',async()=>{
    const toolset=await new DecoratedToolsetStrategy(providerFixture().provider,'test','1').create({name:'Test'})
    const preview=toolset.getMcpCapabilityDefinitions().tools.find(item=>item.name==='excalidraw_diagram_create_preview')
    await expect(preview.execute({drawingId:'drawing',expectedRevision:1,operationId:'quality-op'},context)).rejects.toThrow()
  })
  it('requires operation identity on MCP technical mutations',async()=>{
    const toolset=await new DecoratedToolsetStrategy(providerFixture().provider,'test','1').create({name:'Test'})
    const validate=toolset.getMcpCapabilityDefinitions().tools.find(item=>item.name==='excalidraw_diagram_validate')
    await expect(validate.execute({drawingId:'drawing',expectedRevision:1},context)).rejects.toThrow('operation_id_required')
  })
})
