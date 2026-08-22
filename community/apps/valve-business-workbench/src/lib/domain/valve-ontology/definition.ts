import { VALVE_ONTOLOGY_MANIFEST } from './manifest'
import type {
  ValveOntologyActionTypeDefinition,
  ValveOntologyEntityInput,
  ValveOntologyEntityTypeDefinition,
  ValveOntologyRelationInput,
  ValveOntologyRelationTypeDefinition
} from './types'

export interface ValveOntologyDefinitionDraft {
  entityTypes: ValveOntologyEntityTypeDefinition[]
  relationTypes: ValveOntologyRelationTypeDefinition[]
  actionTypes: ValveOntologyActionTypeDefinition[]
  dataBindings: []
  instances: ValveOntologyEntityInput[]
  relations: ValveOntologyRelationInput[]
  layout: {
    entityTypePositions: Record<string, { x: number; y: number }>
    instancePositions: Record<string, { x: number; y: number }>
    viewport: { x: number; y: number; zoom: number }
  }
}

const sourceEvidence = {
  source: '阀门业务工作台内置产品演示数据',
  purpose: '仅用于展示本体对象 360、关系、证据、约束和受控 Actions，不代表客户生产数据。'
}

export function buildValveOntologyDefinitionDraft(): ValveOntologyDefinitionDraft {
  const instances: ValveOntologyEntityInput[] = [
    {
      entityTypeCode: 'valve',
      externalKey: 'VALVE-11SFCD015-2IN',
      displayName: 'Split Body Ball Valve 2" Class 150',
      currentStateCode: 'active',
      aliases: ['2 inch split body ball valve', 'Class 150 ball valve'],
      attributes: {
        size: '2 inch',
        valve_type: 'Ball Valve',
        pressure_rating: 'Class 150',
        design_pressure: 19.5,
        design_temperature: 200,
        face_to_face_length: 178,
        flow_coefficient_cv: 47,
        is_fire_safe: true,
        manufacturer: 'Demo Valve Works',
        model: '11SFCD015',
        service: 'General process service'
      },
      evidence: {
        ...sourceEvidence,
        drawing_reference: 'DEMO-DWG-11SFCD015',
        datasheet_reference: 'DEMO-DATASHEET-11SFCD015',
        standard_reference: 'API 6D'
      },
      provenance: [{ ref: 'plugin://valve-business-workbench/demo/VALVE-11SFCD015-2IN', source: 'resource_instance' }]
    },
    {
      entityTypeCode: 'valve_component',
      externalKey: 'COMP-BODY-11SFCD015',
      displayName: 'Valve Body ASTM A351 CF8M',
      currentStateCode: 'active',
      attributes: {
        component_type: 'Valve Body',
        material_grade: 'ASTM A351 CF8M',
        drawing_reference: 'DEMO-DWG-11SFCD015-BODY',
        criticality: 'High'
      },
      evidence: { ...sourceEvidence, drawing_reference: 'DEMO-DWG-11SFCD015-BODY' }
    },
    {
      entityTypeCode: 'valve_component',
      externalKey: 'COMP-SEAT-11SFCD015',
      displayName: 'Valve Seat RPTFE',
      currentStateCode: 'active',
      attributes: {
        component_type: 'Valve Seat',
        material_grade: 'RPTFE',
        drawing_reference: 'DEMO-DWG-11SFCD015-SEAT',
        criticality: 'High'
      },
      evidence: { ...sourceEvidence, drawing_reference: 'DEMO-DWG-11SFCD015-SEAT' }
    },
    {
      entityTypeCode: 'actuator',
      externalKey: 'ACT-ELEC-11SFCD015',
      displayName: 'Electric Actuator for 11SFCD015',
      currentStateCode: 'active',
      attributes: { actuator_type: 'Electric', fail_position: 'Fail last', torque_nm: 450, power_supply: '380 VAC' },
      evidence: { ...sourceEvidence, datasheet_reference: 'DEMO-ACT-11SFCD015' }
    },
    {
      entityTypeCode: 'material',
      externalKey: 'MAT-A351-CF8M',
      displayName: 'ASTM A351 Grade CF8M',
      currentStateCode: 'active',
      attributes: { grade: 'CF8M', specification: 'ASTM A351', material_type: 'Austenitic stainless steel casting' },
      evidence: { ...sourceEvidence, standard_reference: 'ASTM A351/A351M' }
    },
    {
      entityTypeCode: 'material',
      externalKey: 'MAT-RPTFE',
      displayName: 'Reinforced PTFE',
      currentStateCode: 'active',
      attributes: { grade: 'RPTFE', specification: 'Demo material specification', material_type: 'Reinforced polymer' },
      evidence: { ...sourceEvidence, material_certificate: 'DEMO-MTC-RPTFE-001' }
    },
    {
      entityTypeCode: 'standard',
      externalKey: 'STD-API-6D',
      displayName: 'API 6D Pipeline Valves',
      currentStateCode: 'active',
      attributes: { standard_code: 'API 6D', title: 'Specification for Pipeline and Piping Valves', edition: 'Demo reference', issuing_body: 'API' },
      evidence: { ...sourceEvidence, standard_reference: 'API 6D' }
    }
  ]

  const relations: ValveOntologyRelationInput[] = [
    relation('has_part', 'valve', 'VALVE-11SFCD015-2IN', 'valve_component', 'COMP-BODY-11SFCD015', 'DEMO-DWG-11SFCD015'),
    relation('has_part', 'valve', 'VALVE-11SFCD015-2IN', 'valve_component', 'COMP-SEAT-11SFCD015', 'DEMO-DWG-11SFCD015'),
    relation('has_material', 'valve_component', 'COMP-BODY-11SFCD015', 'material', 'MAT-A351-CF8M', 'DEMO-MTC-CF8M-001'),
    relation('has_material', 'valve_component', 'COMP-SEAT-11SFCD015', 'material', 'MAT-RPTFE', 'DEMO-MTC-RPTFE-001'),
    relation('driven_by', 'valve', 'VALVE-11SFCD015-2IN', 'actuator', 'ACT-ELEC-11SFCD015', 'DEMO-ACT-11SFCD015'),
    relation('complies_with', 'valve', 'VALVE-11SFCD015-2IN', 'standard', 'STD-API-6D', 'API 6D')
  ]

  return {
    entityTypes: VALVE_ONTOLOGY_MANIFEST.entityTypes.map((entityType) => ({
      ...entityType,
      attributes: entityType.attributes.map((item) => ({ ...item }))
    })),
    relationTypes: VALVE_ONTOLOGY_MANIFEST.relationTypes.map((relationType) => ({
      ...relationType,
      attributes: relationType.attributes.map((item) => ({ ...item }))
    })),
    actionTypes: VALVE_ONTOLOGY_MANIFEST.actionTypes.map((actionType) => ({
      ...actionType,
      targetEntityTypeCodes: [...actionType.targetEntityTypeCodes],
      attributes: actionType.attributes.map((item) => ({ ...item })),
      intentTags: [...actionType.intentTags],
      preconditions: [...actionType.preconditions],
      inputSchema: {
        required: [...actionType.inputSchema.required],
        properties: { ...actionType.inputSchema.properties }
      },
      effects: actionType.effects.map((item) => ({ ...item }))
    })),
    dataBindings: [],
    instances,
    relations,
    layout: {
      entityTypePositions: {
        valve: { x: 60, y: 180 },
        valve_component: { x: 380, y: 80 },
        actuator: { x: 380, y: 360 },
        material: { x: 720, y: 40 },
        standard: { x: 720, y: 360 }
      },
      instancePositions: {
        'valve:VALVE-11SFCD015-2IN': { x: 80, y: 220 },
        'valve_component:COMP-BODY-11SFCD015': { x: 380, y: 80 },
        'valve_component:COMP-SEAT-11SFCD015': { x: 380, y: 240 },
        'actuator:ACT-ELEC-11SFCD015': { x: 380, y: 420 },
        'material:MAT-A351-CF8M': { x: 720, y: 40 },
        'material:MAT-RPTFE': { x: 720, y: 220 },
        'standard:STD-API-6D': { x: 720, y: 420 }
      },
      viewport: { x: 0, y: 0, zoom: 0.85 }
    }
  }
}

function relation(
  relationTypeCode: string,
  sourceEntityTypeCode: string,
  sourceExternalKey: string,
  targetEntityTypeCode: string,
  targetExternalKey: string,
  evidenceRef: string
): ValveOntologyRelationInput {
  return {
    relationTypeCode,
    source: { entityTypeCode: sourceEntityTypeCode, externalKey: sourceExternalKey },
    target: { entityTypeCode: targetEntityTypeCode, externalKey: targetExternalKey },
    attributes: {},
    evidence: { ...sourceEvidence, reference: evidenceRef },
    provenance: [{ ref: `plugin://valve-business-workbench/demo/relation/${relationTypeCode}/${sourceExternalKey}/${targetExternalKey}`, source: 'resource_instance' }]
  }
}
