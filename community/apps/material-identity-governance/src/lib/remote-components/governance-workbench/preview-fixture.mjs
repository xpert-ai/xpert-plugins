// src/lib/demo-scenarios.ts
import { createHash as createHash2 } from "node:crypto";

// src/lib/mock-drawings.ts
import { createHash } from "node:crypto";
var xml = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function createMockDrawing(material2) {
  const body = material2.category === "bracket" ? '<path d="M230 160h300v150H350v-70H230Z"/><circle cx="275" cy="198" r="14"/><circle cx="480" cy="198" r="14"/><path d="M350 240h180"/>' : material2.category === "bearing" ? '<circle cx="370" cy="215" r="100"/><circle cx="370" cy="215" r="72"/><circle cx="370" cy="215" r="42"/><path d="M245 215h250M370 90v250" stroke-dasharray="9 6"/>' : '<path d="M260 145h250v140H260Z M260 180h250 M260 250h250"/><ellipse cx="260" cy="215" rx="32" ry="70"/><ellipse cx="510" cy="215" rx="32" ry="70"/><path d="M220 215h335" stroke-dasharray="9 6"/>';
  const metadata = material2.attributes.map((a) => `<attribute key="${xml(a.key)}" value="${xml(a.value)}" unit="${xml(a.unit ?? "")}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><metadata id="mock-plm-annotations">${metadata}</metadata><rect width="960" height="640" fill="#fff"/><g fill="none" stroke="#27364b" stroke-width="2"><rect x="24" y="24" width="912" height="592"/>${body}<path d="M210 350h340M230 335v30M530 335v30M210 125v190M195 145h30M195 285h30"/></g><g fill="#1c2b40" font-family="Arial,Microsoft YaHei,sans-serif"><text x="48" y="60" font-size="22">\u6C7D\u8F66\u96F6\u90E8\u4EF6 \xB7 \u7814\u53D1\u53D1\u5E03\u56FE\u7EB8\uFF08Mock PLM\uFF09</text><text x="48" y="88" font-size="14">${xml(material2.name)} \xB7 ${xml(material2.plant)}</text>${material2.attributes.map((a, i) => `<text x="620" y="${145 + i * 30}" font-size="17">${xml(a.label)}\uFF1A${xml(a.value)} ${xml(a.unit ?? "")}</text>`).join("")}<text x="280" y="385" font-size="14">\u793A\u610F\u6295\u5F71 \xB7 \u5173\u952E\u5C3A\u5BF8\u4EE5\u53F3\u4FA7\u53D1\u5E03\u6807\u6CE8\u4E3A\u51C6</text><text x="48" y="464" font-size="16">\u6765\u6E90\u90E8\u95E8\uFF1A\u7814\u53D1\u8BBE\u8BA1\u4E2D\u5FC3\u3000\u72B6\u6001\uFF1A\u5DF2\u53D1\u5E03\u3000\u7528\u9014\uFF1A\u7269\u6599\u8EAB\u4EFD\u6CBB\u7406\u6F14\u793A</text><text x="48" y="498" font-size="16">\u56FE\u53F7\uFF1A${xml(material2.drawing)}\u3000\u7248\u672C\uFF1A${xml(material2.revision)}\u3000\u7F16\u53F7\uFF1A${xml(material2.id)}</text><text x="48" y="536" font-size="14">\u8BC6\u522B\u65B9\u5F0F\uFF1A\u8BFB\u53D6\u56FE\u7EB8\u5185\u5D4C\u7684\u7ED3\u6784\u5316\u6807\u6CE8\uFF0C\u5E76\u4FDD\u7559\u5B57\u6BB5\u6765\u6E90\u8BC1\u636E\u3002</text><text x="48" y="568" font-size="14">\u8FD9\u662F\u7A0B\u5E8F\u751F\u6210\u7684\u6A21\u62DF\u7814\u53D1\u56FE\u7EB8\uFF0C\u4E0D\u53EF\u7528\u4E8E\u751F\u4EA7\u52A0\u5DE5\u3002</text></g></svg>`;
  return { id: `drawing-${material2.id}`, sourceId: material2.id, title: `${material2.drawing} / ${material2.revision}`, mediaType: "image/svg+xml", content: svg, sha256: createHash("sha256").update(svg).digest("hex") };
}
function extractMockDrawing(document) {
  if (createHash("sha256").update(document.content).digest("hex") !== document.sha256) throw new Error("drawing_snapshot_tampered");
  const match = document.content.match(/<metadata id="mock-plm-annotations">([\s\S]*?)<\/metadata>/);
  if (!match) throw new Error("drawing_annotations_missing");
  const decode = (s) => s.replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
  return [...match[1].matchAll(/<attribute key="([^"]+)" value="([^"]+)" unit="([^"]*)"\/>/g)].map((m) => ({ key: decode(m[1]), value: decode(m[2]), unit: decode(m[3]) || null }));
}

// src/lib/demo-scenarios.ts
var timestamp = "2026-09-05T01:00:00.000Z";
var titles = { duplicate_codes: "\u8F6E\u6BC2\u8F74\u627F\u8DE8\u5DE5\u5382\u91CD\u590D\u7F16\u7801\u6CBB\u7406", code_collision: "\u7535\u6C60\u6258\u67B6\u540C\u7801\u5F02\u7269\u51B2\u7A81\u6CBB\u7406", drawing_request: "\u8F6C\u5411\u7535\u673A\u9694\u5957\u56FE\u7EB8\u65B0\u589E\u9632\u91CD" };
function attr(key, label, value, unit = null) {
  return { key, label, value, unit, critical: true, evidenceIds: [`evidence-${key}`] };
}
function material(partial) {
  return { system: "ERP", plant: "\u82CF\u5DDE\u5DE5\u5382", category: "automotive-part", drawing: "", revision: "A", supplier: "\u534E\u8FB0\u6C7D\u8F66\u96F6\u90E8\u4EF6", quantity: 0, unitCost: 0, ...partial };
}
function createDemoCase(kind, id, title, now = timestamp) {
  let materials;
  if (kind === "duplicate_codes") {
    const attributes = [attr("material", "\u6750\u8D28", "GCr15"), attr("bore", "\u5185\u5F84", "20", "mm"), attr("outer", "\u5916\u5F84", "47", "mm"), attr("width", "\u5BBD\u5EA6", "14", "mm"), attr("precision", "\u7CBE\u5EA6", "P6"), attr("seal", "\u5BC6\u5C01", "2RS")];
    materials = [material({ id: "sz-bearing", code: "SZ-BRG-6204-02", name: "\u6DF1\u6C9F\u7403\u8F74\u627F 6204-2RS/P6", category: "bearing", drawing: "BRG-6204-2RS", attributes, quantity: 2400, unitCost: 28.5, supplier: "\u82CF\u5DDE\u7CBE\u5DE5\u8F74\u627F" }), material({ id: "cq-bearing", code: "CQ-1004582", name: "\u8F74\u627F 6204 \u53CC\u9762\u5BC6\u5C01 P6", plant: "\u91CD\u5E86\u5DE5\u5382", category: "bearing", drawing: "BRG-6204-2RS", attributes: attributes.map((a) => a.key === "bore" ? { ...a, value: "0.020", unit: "m" } : { ...a }), quantity: 1800, unitCost: 29, supplier: "\u6E1D\u4E1C\u52A8\u529B\u914D\u5957" })];
  } else if (kind === "code_collision") {
    materials = [material({ id: "bracket-steel", code: "MT-BR-001268", name: "\u7535\u6C60\u5305\u56FA\u5B9A\u6258\u67B6", category: "bracket", drawing: "BAT-BR-101", attributes: [attr("material", "\u6750\u8D28", "DC01"), attr("thickness", "\u677F\u539A", "3", "mm"), attr("hole", "\u5B89\u88C5\u5B54\u5F84", "8.5", "mm")], quantity: 760, unitCost: 42 }), material({ id: "bracket-stainless", code: "MT-BR-001268", name: "\u7535\u6C60\u5305\u56FA\u5B9A\u6258\u67B6", plant: "\u91CD\u5E86\u5DE5\u5382", category: "bracket", drawing: "BAT-BR-208", revision: "B", attributes: [attr("material", "\u6750\u8D28", "SUS304"), attr("thickness", "\u677F\u539A", "5", "mm"), attr("hole", "\u5B89\u88C5\u5B54\u5F84", "10.5", "mm")], quantity: 420, unitCost: 69 })];
  } else {
    const attributes = [attr("material", "\u6750\u8D28", "20CrMnTi"), attr("bore", "\u5185\u5F84", "20", "mm"), attr("outer", "\u5916\u5F84", "32", "mm"), attr("length", "\u957F\u5EA6", "40", "mm"), attr("hardness", "\u8868\u9762\u786C\u5EA6", "58-62 HRC")];
    materials = [material({ id: "plm-spacer", code: "REQ-RD-260905-17", name: "\u8F6C\u5411\u7535\u673A\u7CBE\u5BC6\u9694\u5957\u65B0\u5EFA\u7533\u8BF7", system: "PLM", plant: "\u7814\u53D1\u8BBE\u8BA1\u4E2D\u5FC3", category: "spacer", drawing: "STR-SP-2040", revision: "C", attributes, quantity: 0, unitCost: 18.6 }), material({ id: "erp-spacer", code: "MAT-SP-000842", name: "\u9694\u5957 20\xD732\xD740 \u6E17\u78B3\u6DEC\u706B", category: "spacer", drawing: "STR-SP-2040", revision: "C", attributes: attributes.map((a) => ({ ...a })), quantity: 3600, unitCost: 18.6 })];
  }
  const evidence = materials.flatMap((m, index) => [
    ...m.attributes.map((a) => ({ id: `${m.id}-${a.key}`, system: m.system, reference: `${m.system}/${m.code}/rev-${m.revision}`, field: a.label, value: `${a.value}${a.unit ?? ""}`, excerpt: `${m.plant} ${m.name}\uFF1A${a.label}\u6807\u6CE8 ${a.value}${a.unit ?? ""}\u3002`, observedAt: now, ...m.system === "PLM" ? { page: 1 } : {} })),
    { id: `${m.id}-drawing`, system: "PLM", reference: `PLM/${m.drawing}/${m.revision}`, field: "\u56FE\u53F7\u4E0E\u7248\u672C", value: `${m.drawing}/${m.revision}`, excerpt: `\u5DF2\u53D1\u5E03\u56FE\u7EB8 ${m.drawing}\uFF0C\u7248\u672C ${m.revision}\uFF0C\u6765\u6E90\u7814\u53D1\u8BBE\u8BA1\u90E8\u95E8\u3002`, observedAt: now, page: 1 },
    { id: `${m.id}-lot`, system: "WMS", reference: `LOT-260905-${index + 1}`, field: "\u6279\u6B21\u5E93\u5B58", value: String(m.quantity), excerpt: `${m.plant}\u5F53\u524D\u5E93\u5B58 ${m.quantity} \u4EF6\uFF0C\u5386\u53F2\u6279\u6B21\u4FDD\u7559\u539F\u7F16\u7801\u8FFD\u6EAF\u3002`, observedAt: now }
  ]);
  materials = materials.map((m) => ({ ...m, attributes: m.attributes.map((a) => ({ ...a, evidenceIds: [`${m.id}-${a.key}`] })) }));
  const drawings = materials.map(createMockDrawing), sourceSnapshotHash = createHash2("sha256").update(JSON.stringify({ materials, evidence, drawings })).digest("hex");
  return { drawings, sourceSnapshotHash, id, caseKey: `MIG-${kind === "duplicate_codes" ? "DUP" : kind === "code_collision" ? "COL" : "RD"}-${id.slice(-6).toUpperCase()}`, title: title || titles[kind], kind, status: "open", revision: 1, templateKey: "material_identity_governance", templateVersion: 1, createdAt: now, updatedAt: now, materials, evidence, candidates: [], impacts: [], artifacts: [], criticalConflict: null, proposal: null, approval: null, publications: [], mockMode: true };
}

// src/lib/flow-definition.ts
var FLOW_DEFINITION = {
  "schemaVersion": "1.3",
  "pipeline": {
    "key": "material-identity-governance",
    "title": "\u7269\u6599\u4E3B\u6570\u636E\u667A\u80FD\u6CBB\u7406",
    "description": "\u6C7D\u8F66\u96F6\u90E8\u4EF6\u5236\u9020\u7684\u7269\u6599\u8EAB\u4EFD\u3001\u7F16\u7801\u522B\u540D\u3001\u89C4\u683C\u51B2\u7A81\u4E0E\u7814\u53D1\u65B0\u589E\u9632\u91CD\u6CBB\u7406\u3002",
    "artifactNamespace": "material_identity",
    "templateKey": "material_identity_governance",
    "templateVersion": 1,
    "startNodeKey": "collect-evidence"
  },
  "caseModel": {
    "keyField": "case-id",
    "titleField": "case-title",
    "statusField": "case-status",
    "revisionField": "case-revision",
    "templateKeyField": "flow-template-key",
    "templateVersionField": "flow-template-version",
    "scopeFields": [
      "tenant-id",
      "organization-id"
    ],
    "lifecycleStatuses": [
      "open",
      "active",
      "blocked",
      "review_required",
      "approved",
      "completed",
      "rejected",
      "cancelled"
    ]
  },
  "delivery": {
    "surfaces": [
      "assistant",
      "backend",
      "workbench"
    ],
    "assistantTopology": "both",
    "assistantParticipants": {
      "roleMode": "independent_assistants",
      "orchestratorDelegation": "external_xperts",
      "externalXpertConnections": "direct_required"
    },
    "pipelineWorkbench": {
      "mode": "required",
      "overviewViewKey": "material_identity_pipeline_overview",
      "dashboardViewKey": "material_identity_operations_dashboard"
    }
  },
  "projectionContract": {
    "dashboardProject": "pipeline-dashboard-project",
    "caseList": "case-list",
    "caseCreate": "case-create",
    "caseGet": "case-get",
    "flowProject": "case-flow-project",
    "executableNodes": "case-executable-nodes",
    "nodeStart": "case-node-start",
    "nextNodeProcess": "case-next-node-process",
    "humanTaskComplete": "case-human-task-complete",
    "blockerResolve": "case-blocker-resolve",
    "nodeWorkspaceGet": "case-node-workspace-get",
    "executionRecordList": "case-execution-record-list",
    "refreshStrategy": "hybrid"
  },
  "executionRecords": {
    "mode": "case_node_lane_bound",
    "retention": "immutable_attempts",
    "navigationClientCommand": "workbench.navigation.open",
    "navigationTarget": "assistant.conversation",
    "visibleLimit": 10,
    "presentationTargets": [
      "assistant_card",
      "task_card"
    ]
  },
  "viewExperience": {
    "componentLibrary": "@xpert-ai/plugin-shadcn-ui",
    "dashboard": {
      "chartLibrary": "echarts",
      "layout": "management_monitoring"
    },
    "swimlane": {
      "assistantAvatarSource": "platform_assistant",
      "assistantExecutionMarkerPlacement": "assistant_card_bottom_right",
      "nodeExecutionMarkerPlacement": "task_card_bottom_right",
      "logicNodeShape": "diamond",
      "dragPan": true,
      "laneSelection": true
    }
  },
  "features": [
    "material_identity_coordinator",
    "material_identity_intake",
    "material_identity_engineering",
    "material_identity_standardization",
    "material_identity_quality",
    "material_identity_impact",
    "material_identity_governance",
    "material_identity_publisher"
  ],
  "roles": [
    {
      "key": "coordinator",
      "title": "\u6CBB\u7406\u534F\u8C03\u8005",
      "kind": "orchestrator",
      "writeAuthority": false,
      "assistantTemplateKey": "material-identity-coordinator",
      "middlewareBindings": [
        "material_identity_coordinator"
      ]
    },
    {
      "key": "intake",
      "title": "\u6570\u636E\u91C7\u96C6\u4E13\u5458",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-intake",
      "middlewareBindings": [
        "material_identity_intake"
      ]
    },
    {
      "key": "engineering",
      "title": "\u7814\u53D1\u56FE\u7EB8\u5DE5\u7A0B\u5E08",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-engineering",
      "middlewareBindings": [
        "material_identity_engineering"
      ]
    },
    {
      "key": "standardization",
      "title": "\u7269\u6599\u6807\u51C6\u5316\u5DE5\u7A0B\u5E08",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-standardization",
      "middlewareBindings": [
        "material_identity_standardization"
      ]
    },
    {
      "key": "quality",
      "title": "\u8D28\u91CF\u51B2\u7A81\u5BA1\u8BA1\u5458",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-quality",
      "middlewareBindings": [
        "material_identity_quality"
      ]
    },
    {
      "key": "impact",
      "title": "\u4F9B\u5E94\u94FE\u5F71\u54CD\u5206\u6790\u5E08",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-impact",
      "middlewareBindings": [
        "material_identity_impact"
      ]
    },
    {
      "key": "governance",
      "title": "\u4E3B\u6570\u636E\u6CBB\u7406\u4E13\u5458",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-governance",
      "middlewareBindings": [
        "material_identity_governance"
      ]
    },
    {
      "key": "publisher",
      "title": "\u7CFB\u7EDF\u53D1\u5E03\u4E0E\u76D1\u63A7\u4E13\u5458",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-publisher",
      "middlewareBindings": [
        "material_identity_publisher"
      ]
    }
  ],
  "lanes": [
    {
      "key": "intake",
      "title": "\u6570\u636E\u91C7\u96C6\u4E13\u5458",
      "accountableRoleKey": "intake",
      "order": 10
    },
    {
      "key": "engineering",
      "title": "\u7814\u53D1\u56FE\u7EB8\u5DE5\u7A0B\u5E08",
      "accountableRoleKey": "engineering",
      "order": 20
    },
    {
      "key": "standardization",
      "title": "\u7269\u6599\u6807\u51C6\u5316\u5DE5\u7A0B\u5E08",
      "accountableRoleKey": "standardization",
      "order": 30
    },
    {
      "key": "quality",
      "title": "\u8D28\u91CF\u51B2\u7A81\u5BA1\u8BA1\u5458",
      "accountableRoleKey": "quality",
      "order": 40
    },
    {
      "key": "impact",
      "title": "\u4F9B\u5E94\u94FE\u5F71\u54CD\u5206\u6790\u5E08",
      "accountableRoleKey": "impact",
      "order": 50
    },
    {
      "key": "governance",
      "title": "\u4E3B\u6570\u636E\u6CBB\u7406\u4E13\u5458",
      "accountableRoleKey": "governance",
      "order": 60
    },
    {
      "key": "publisher",
      "title": "\u7CFB\u7EDF\u53D1\u5E03\u4E0E\u76D1\u63A7\u4E13\u5458",
      "accountableRoleKey": "publisher",
      "order": 70
    }
  ],
  "stages": [
    {
      "key": "intake",
      "title": "\u6765\u6E90\u53D6\u8BC1",
      "order": 0
    },
    {
      "key": "understand",
      "title": "\u6280\u672F\u7406\u89E3",
      "order": 10
    },
    {
      "key": "identify",
      "title": "\u8EAB\u4EFD\u6838\u9A8C",
      "order": 20
    },
    {
      "key": "assess",
      "title": "\u98CE\u9669\u4E0E\u5F71\u54CD",
      "order": 30
    },
    {
      "key": "decide",
      "title": "\u6CBB\u7406\u5BA1\u6279",
      "order": 40
    },
    {
      "key": "publish",
      "title": "\u53D1\u5E03\u95ED\u73AF",
      "order": 50
    }
  ],
  "artifacts": [
    {
      "key": "evidence",
      "title": "\u91C7\u96C6\u8DE8\u7CFB\u7EDF\u8BC1\u636E",
      "ownerRoleKey": "intake",
      "versioned": true
    },
    {
      "key": "drawing",
      "title": "\u8BC6\u522B\u56FE\u7EB8\u4E0E\u5173\u952E\u5C5E\u6027",
      "ownerRoleKey": "engineering",
      "versioned": true
    },
    {
      "key": "normalized",
      "title": "\u7EDF\u4E00\u672F\u8BED\u4E0E\u8BA1\u91CF\u5355\u4F4D",
      "ownerRoleKey": "standardization",
      "versioned": true
    },
    {
      "key": "candidates",
      "title": "\u53EC\u56DE\u5019\u9009\u4E0E\u8EAB\u4EFD\u5224\u5B9A",
      "ownerRoleKey": "standardization",
      "versioned": true
    },
    {
      "key": "audit",
      "title": "\u5BA1\u8BA1\u540C\u7801\u89C4\u683C\u51B2\u7A81",
      "ownerRoleKey": "quality",
      "versioned": true
    },
    {
      "key": "impact",
      "title": "\u5206\u6790 BOM\u3001\u5E93\u5B58\u4E0E\u91C7\u8D2D\u5F71\u54CD",
      "ownerRoleKey": "impact",
      "versioned": true
    },
    {
      "key": "proposal",
      "title": "\u5F62\u6210\u53EF\u89E3\u91CA\u6CBB\u7406\u5EFA\u8BAE",
      "ownerRoleKey": "governance",
      "versioned": true
    },
    {
      "key": "approval",
      "title": "\u4EBA\u5DE5\u6279\u51C6\u6CBB\u7406\u65B9\u6848",
      "ownerRoleKey": "governance",
      "versioned": true
    },
    {
      "key": "publication",
      "title": "\u53D1\u5E03\u9EC4\u91D1\u8BB0\u5F55\u4E0E\u7F16\u7801\u6620\u5C04",
      "ownerRoleKey": "publisher",
      "versioned": true
    },
    {
      "key": "containment",
      "title": "\u51B2\u7A81\u9694\u79BB\u5EFA\u8BAE",
      "ownerRoleKey": "quality",
      "versioned": true
    }
  ],
  "middleware": [
    {
      "key": "material_identity_coordinator",
      "ownerRoleKey": "coordinator",
      "featureKeys": [
        "material_identity_coordinator"
      ],
      "tools": [
        {
          "name": "material_identity_coordinator_read",
          "mode": "read"
        },
        {
          "name": "material_identity_dispatch_next",
          "mode": "decision_support"
        }
      ]
    },
    {
      "key": "material_identity_intake",
      "ownerRoleKey": "intake",
      "featureKeys": [
        "material_identity_intake"
      ],
      "tools": [
        {
          "name": "material_identity_intake_read",
          "mode": "read"
        },
        {
          "name": "material_identity_collect_evidence",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_engineering",
      "ownerRoleKey": "engineering",
      "featureKeys": [
        "material_identity_engineering"
      ],
      "tools": [
        {
          "name": "material_identity_engineering_read",
          "mode": "read"
        },
        {
          "name": "material_identity_extract_drawing",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_standardization",
      "ownerRoleKey": "standardization",
      "featureKeys": [
        "material_identity_standardization"
      ],
      "tools": [
        {
          "name": "material_identity_standardization_read",
          "mode": "read"
        },
        {
          "name": "material_identity_normalize_material",
          "mode": "write"
        },
        {
          "name": "material_identity_match_identity",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_quality",
      "ownerRoleKey": "quality",
      "featureKeys": [
        "material_identity_quality"
      ],
      "tools": [
        {
          "name": "material_identity_quality_read",
          "mode": "read"
        },
        {
          "name": "material_identity_audit_conflicts",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_impact",
      "ownerRoleKey": "impact",
      "featureKeys": [
        "material_identity_impact"
      ],
      "tools": [
        {
          "name": "material_identity_impact_read",
          "mode": "read"
        },
        {
          "name": "material_identity_assess_impact",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_governance",
      "ownerRoleKey": "governance",
      "featureKeys": [
        "material_identity_governance"
      ],
      "tools": [
        {
          "name": "material_identity_governance_read",
          "mode": "read"
        },
        {
          "name": "material_identity_propose_governance",
          "mode": "write"
        }
      ]
    },
    {
      "key": "material_identity_publisher",
      "ownerRoleKey": "publisher",
      "featureKeys": [
        "material_identity_publisher"
      ],
      "tools": [
        {
          "name": "material_identity_publisher_read",
          "mode": "read"
        },
        {
          "name": "material_identity_publish_records",
          "mode": "write"
        }
      ]
    }
  ],
  "views": [
    {
      "key": "material_identity_operations_dashboard",
      "title": "\u6CBB\u7406\u76D1\u63A7",
      "kind": "operations_dashboard",
      "featureKeys": [
        "material_identity_coordinator"
      ],
      "actionKeys": [
        "case-create",
        "case-refresh",
        "node-start",
        "case-process-next",
        "blocker-resolve"
      ],
      "clientCommandKeys": [
        "workbench.navigation.open"
      ]
    },
    {
      "key": "material_identity_pipeline_overview",
      "title": "\u6848\u4F8B\u534F\u540C\u6D41\u6C34\u7EBF",
      "kind": "pipeline_overview",
      "featureKeys": [
        "material_identity_coordinator"
      ],
      "actionKeys": [
        "case-create",
        "case-refresh",
        "node-start",
        "case-process-next",
        "blocker-resolve"
      ],
      "clientCommandKeys": [
        "workbench.navigation.open"
      ]
    },
    {
      "key": "material_identity_case_workspace",
      "title": "\u8BC1\u636E\u4E0E\u6CBB\u7406\u5BA1\u6279",
      "kind": "node_workspace",
      "featureKeys": [
        "material_identity_governance"
      ],
      "actionKeys": [
        "human-task-complete",
        "node-open"
      ],
      "clientCommandKeys": [
        "workbench.navigation.open"
      ]
    }
  ],
  "routeFacts": [
    {
      "key": "critical-conflict",
      "sourceArtifactKey": "audit",
      "values": [
        "clear",
        "conflict"
      ]
    }
  ],
  "nodes": [
    {
      "key": "collect-evidence",
      "title": "\u91C7\u96C6\u8DE8\u7CFB\u7EDF\u8BC1\u636E",
      "kind": "task",
      "laneKey": "intake",
      "stageKey": "intake",
      "openMode": "dialog",
      "accountableRoleKey": "intake",
      "completion": {
        "artifactKey": "evidence",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_collect_evidence"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_intake"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "extract-drawing",
      "title": "\u8BC6\u522B\u56FE\u7EB8\u4E0E\u5173\u952E\u5C5E\u6027",
      "kind": "task",
      "laneKey": "engineering",
      "stageKey": "understand",
      "openMode": "dialog",
      "accountableRoleKey": "engineering",
      "completion": {
        "artifactKey": "drawing",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_extract_drawing"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_engineering"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "normalize-material",
      "title": "\u7EDF\u4E00\u672F\u8BED\u4E0E\u8BA1\u91CF\u5355\u4F4D",
      "kind": "task",
      "laneKey": "standardization",
      "stageKey": "understand",
      "openMode": "dialog",
      "accountableRoleKey": "standardization",
      "completion": {
        "artifactKey": "normalized",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_normalize_material"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_standardization"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "match-identity",
      "title": "\u53EC\u56DE\u5019\u9009\u4E0E\u8EAB\u4EFD\u5224\u5B9A",
      "kind": "task",
      "laneKey": "standardization",
      "stageKey": "identify",
      "openMode": "dialog",
      "accountableRoleKey": "standardization",
      "completion": {
        "artifactKey": "candidates",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_match_identity"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_standardization"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "audit-conflicts",
      "title": "\u5BA1\u8BA1\u540C\u7801\u89C4\u683C\u51B2\u7A81",
      "kind": "task",
      "laneKey": "quality",
      "stageKey": "assess",
      "openMode": "dialog",
      "accountableRoleKey": "quality",
      "completion": {
        "artifactKey": "audit",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_audit_conflicts"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_quality"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "assess-impact",
      "title": "\u5206\u6790 BOM\u3001\u5E93\u5B58\u4E0E\u91C7\u8D2D\u5F71\u54CD",
      "kind": "task",
      "laneKey": "impact",
      "stageKey": "assess",
      "openMode": "dialog",
      "accountableRoleKey": "impact",
      "completion": {
        "artifactKey": "impact",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_assess_impact"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_impact"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "propose-governance",
      "title": "\u5F62\u6210\u53EF\u89E3\u91CA\u6CBB\u7406\u5EFA\u8BAE",
      "kind": "task",
      "laneKey": "governance",
      "stageKey": "decide",
      "openMode": "view",
      "accountableRoleKey": "governance",
      "completion": {
        "artifactKey": "proposal",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_propose_governance"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_governance"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "medium",
      "humanGate": "none",
      "workspaceKey": "material_identity_case_workspace"
    },
    {
      "key": "approve-governance",
      "title": "\u4EBA\u5DE5\u6279\u51C6\u6CBB\u7406\u65B9\u6848",
      "kind": "task",
      "laneKey": "governance",
      "stageKey": "decide",
      "openMode": "view",
      "accountableRoleKey": "governance",
      "completion": {
        "artifactKey": "approval",
        "predicate": "status == approved"
      },
      "execution": {
        "mode": "human",
        "toolNames": []
      },
      "requiredFeatureKeys": [
        "material_identity_governance"
      ],
      "allowedActionKeys": [
        "node-open",
        "human-task-complete"
      ],
      "risk": "high",
      "humanGate": "approval",
      "workspaceKey": "material_identity_case_workspace"
    },
    {
      "key": "publish-records",
      "title": "\u53D1\u5E03\u9EC4\u91D1\u8BB0\u5F55\u4E0E\u7F16\u7801\u6620\u5C04",
      "kind": "task",
      "laneKey": "publisher",
      "stageKey": "publish",
      "openMode": "dialog",
      "accountableRoleKey": "publisher",
      "completion": {
        "artifactKey": "publication",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "assistant_task",
        "toolNames": [
          "material_identity_publish_records"
        ]
      },
      "requiredFeatureKeys": [
        "material_identity_publisher"
      ],
      "allowedActionKeys": [
        "node-open",
        "node-start"
      ],
      "risk": "high",
      "humanGate": "external_confirmation"
    },
    {
      "key": "route-conflict",
      "title": "\u5173\u952E\u5C5E\u6027\u5B58\u5728\u51B2\u7A81\uFF1F",
      "kind": "router",
      "stageKey": "assess",
      "routeFactKey": "critical-conflict"
    },
    {
      "key": "contain-conflict",
      "title": "\u6807\u8BB0\u9694\u79BB\u4E0E\u62C6\u5206\u8303\u56F4",
      "kind": "task",
      "laneKey": "quality",
      "stageKey": "assess",
      "openMode": "dialog",
      "accountableRoleKey": "quality",
      "completion": {
        "artifactKey": "containment",
        "predicate": "status == accepted"
      },
      "execution": {
        "mode": "system",
        "toolNames": []
      },
      "requiredFeatureKeys": [
        "material_identity_quality"
      ],
      "allowedActionKeys": [
        "node-open"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "governed",
      "title": "\u6CBB\u7406\u5B8C\u6210",
      "kind": "terminal",
      "stageKey": "publish"
    }
  ],
  "edges": [
    {
      "from": "collect-evidence",
      "to": "extract-drawing"
    },
    {
      "from": "extract-drawing",
      "to": "normalize-material"
    },
    {
      "from": "normalize-material",
      "to": "match-identity"
    },
    {
      "from": "match-identity",
      "to": "audit-conflicts"
    },
    {
      "from": "assess-impact",
      "to": "propose-governance"
    },
    {
      "from": "propose-governance",
      "to": "approve-governance"
    },
    {
      "from": "approve-governance",
      "to": "publish-records"
    },
    {
      "from": "audit-conflicts",
      "to": "route-conflict"
    },
    {
      "from": "route-conflict",
      "to": "assess-impact",
      "condition": {
        "factKey": "critical-conflict",
        "value": "clear"
      }
    },
    {
      "from": "route-conflict",
      "to": "contain-conflict",
      "condition": {
        "factKey": "critical-conflict",
        "value": "conflict"
      }
    },
    {
      "from": "contain-conflict",
      "to": "assess-impact"
    },
    {
      "from": "publish-records",
      "to": "governed"
    }
  ]
};

// src/lib/flow-projector.ts
function projectFlow(current, executions = [], profiles = {}) {
  const completedArtifacts = new Set(current.artifacts.filter((a) => a.status === "accepted").map((a) => a.key));
  const states = /* @__PURE__ */ new Map();
  const inputs = FLOW_DEFINITION.nodes;
  const completed = (key) => states.get(key)?.status === "completed" || states.get(key)?.status === "skipped";
  const incoming = (key) => FLOW_DEFINITION.edges.filter((e) => e.to === key);
  const selected = (e) => !("condition" in e) || current.criticalConflict === null || e.condition.value === (current.criticalConflict ? "conflict" : "clear");
  for (let pass = 0; pass < inputs.length; pass++) for (const [order, n] of inputs.entries()) {
    if (states.has(n.key)) continue;
    const edges = incoming(n.key);
    if (edges.some((e) => !states.has(e.from))) continue;
    const skipped = n.key === "contain-conflict" && current.criticalConflict === false;
    const predecessors = edges.filter(selected).every((e) => completed(e.from));
    const record = executions.filter((r) => r.nodeKey === n.key);
    const active = record.some((r) => r.status === "queued" || r.status === "running");
    let accepted = false, mode = "system", artifactKey = null, lane = "quality";
    if (n.kind === "task") {
      mode = n.execution.mode;
      lane = n.laneKey;
      artifactKey = n.completion.artifactKey;
      accepted = completedArtifacts.has(artifactKey);
      if (n.key === "approve-governance") accepted = current.approval?.decision === "approved" && current.approval.proposalRevision === current.proposal?.revision;
      if (n.key === "contain-conflict") accepted = current.criticalConflict === true && completedArtifacts.has("audit");
    } else if (n.kind === "router") {
      accepted = completedArtifacts.has("audit") && current.criticalConflict !== null;
    } else {
      accepted = current.status === "completed";
      lane = "publisher";
    }
    const rejected = current.status === "rejected";
    const executable = !accepted && !skipped && predecessors && !active && !rejected && n.kind === "task";
    const status = skipped ? "skipped" : accepted ? "completed" : active ? "running" : rejected ? "blocked" : executable ? "ready" : "pending";
    states.set(n.key, { key: n.key, title: n.title, kind: n.kind, laneKey: lane, stageKey: n.stageKey, order, openMode: "openMode" in n ? n.openMode : "dialog", executionMode: mode, status, executable, artifactKey, summary: current.artifacts.filter((a) => a.key === artifactKey).at(-1)?.summary ?? "", executions: record });
  }
  const nodes = [...states.values()].sort((a, b) => a.order - b.order);
  const lanes = FLOW_DEFINITION.lanes.map((l) => ({ key: l.key, title: l.title, order: l.order, assistant: profiles[l.key] ?? { displayName: l.title, templateKey: `material-identity-${l.key}`, primaryAgentKey: `Agent_${l.key}`, avatarUrl: null, available: false }, executions: executions.filter((r) => r.roleKey === l.key) }));
  return { caseId: current.id, revision: current.revision, lanes, stages: FLOW_DEFINITION.stages.map((s) => ({ ...s })), nodes, edges: FLOW_DEFINITION.edges.map((e) => ({ from: e.from, to: e.to, outcome: "condition" in e ? e.condition.value : null, state: !selected(e) ? "skipped" : completed(e.from) ? "selected" : "pending" })), executableNodeKeys: nodes.filter((n) => n.executable).map((n) => n.key), completed: nodes.filter((n) => n.kind === "task" && n.status === "completed").length, total: nodes.filter((n) => n.kind === "task" && n.status !== "skipped").length, blocker: current.status === "review_required" ? "\u4E3B\u6570\u636E\u8D1F\u8D23\u4EBA\u9700\u8981\u5BA1\u6838\u5F53\u524D\u65B9\u6848\uFF0C\u6279\u51C6\u540E\u65B9\u53EF\u53D1\u5E03\u3002" : current.status === "rejected" ? "\u65B9\u6848\u5DF2\u9A73\u56DE\u3002\u4FDD\u7559\u8BC1\u636E\u5E76\u521B\u5EFA\u4FEE\u8BA2\u6848\u4F8B\u91CD\u65B0\u6CBB\u7406\u3002" : null };
}
function projectDashboard(cases, records = []) {
  const flows = cases.map((c) => projectFlow(c, records.filter((r) => r.caseId === c.id)));
  return { generatedAt: (/* @__PURE__ */ new Date()).toISOString(), total: cases.length, active: cases.filter((c) => ["open", "active", "blocked"].includes(c.status)).length, reviewRequired: cases.filter((c) => c.status === "review_required").length, completed: cases.filter((c) => c.status === "completed").length, conflictCount: cases.filter((c) => c.criticalConflict === true).length, exposure: cases.reduce((a, c) => a + c.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0), 0), categories: ["duplicate_codes", "code_collision", "drawing_request"].map((key) => ({ key, count: cases.filter((c) => c.kind === key).length, caseIds: cases.filter((c) => c.kind === key).map((c) => c.id) })), roleQueues: FLOW_DEFINITION.lanes.map((l) => ({ roleKey: l.key, ready: flows.reduce((s, f) => s + f.nodes.filter((n) => n.laneKey === l.key && n.status === "ready").length, 0), running: flows.reduce((s, f) => s + f.nodes.filter((n) => n.laneKey === l.key && n.status === "running").length, 0), completed: flows.reduce((s, f) => s + f.nodes.filter((n) => n.kind === "task" && n.laneKey === l.key && n.status === "completed").length, 0) })) };
}

// src/lib/identity-rules.ts
import { createHash as createHash3 } from "node:crypto";
function normalizeAttribute(a) {
  if (a.unit === "m" && Number.isFinite(Number(a.value))) return { ...a, value: String(Number(a.value) * 1e3), unit: "mm" };
  if (a.unit === "cm" && Number.isFinite(Number(a.value))) return { ...a, value: String(Number(a.value) * 10), unit: "mm" };
  const aliases = { SUS304: "304", "AISI 304": "304", "\u94EC\u8F74\u627F\u94A2": "GCr15" };
  return { ...a, value: aliases[a.value.trim()] ?? a.value.trim(), unit: a.unit === "\u6BEB\u7C73" ? "mm" : a.unit };
}
function compareMaterial(source, candidate) {
  const left = source.attributes.map(normalizeAttribute), right = candidate.attributes.map(normalizeAttribute);
  const required = { bearing: ["material", "bore", "outer", "width", "precision", "seal"], bracket: ["material", "thickness", "hole"], spacer: ["material", "bore", "outer", "length", "hardness"] };
  const keys = [.../* @__PURE__ */ new Set([...required[source.category] ?? ["material"], ...left.map((a) => a.key), ...right.map((a) => a.key)])];
  const differences = keys.map((key) => {
    const a = left.find((x) => x.key === key), b = right.find((x) => x.key === key);
    const present = Boolean(a?.value && b?.value);
    return { key, label: a?.label ?? b?.label ?? key, source: a ? a.value + (a.unit ?? "") : "", candidate: b ? b.value + (b.unit ?? "") : "", result: !present ? "missing" : a.value === b.value && a.unit === b.unit ? "match" : "conflict", critical: (required[source.category] ?? ["material"]).includes(key) || a?.critical === true || b?.critical === true };
  });
  differences.push({ key: "drawing", label: "\u56FE\u53F7", source: source.drawing, candidate: candidate.drawing, result: !source.drawing || !candidate.drawing ? "missing" : source.drawing === candidate.drawing ? "match" : "conflict", critical: true });
  differences.push({ key: "revision", label: "\u56FE\u7EB8\u7248\u672C", source: source.revision, candidate: candidate.revision, result: !source.revision || !candidate.revision ? "missing" : source.revision === candidate.revision ? "match" : "conflict", critical: true });
  const hardFilterPassed = source.category === candidate.category && differences.every((d) => !d.critical || d.result === "match");
  const score = differences.filter((d) => d.result === "match").length / differences.length;
  return { id: candidate.id, code: candidate.code, name: candidate.name, relation: hardFilterPassed ? "same_identity" : differences.some((d) => d.critical && d.result === "missing") ? "uncertain" : "different", score, hardFilterPassed, differences, evidenceIds: [...source.attributes.flatMap((a) => a.evidenceIds), ...candidate.attributes.flatMap((a) => a.evidenceIds)], rationale: !hardFilterPassed && differences.some((d) => d.critical && d.result === "missing") ? "\u5173\u952E\u6280\u672F\u5C5E\u6027\u6216\u56FE\u7EB8\u8BC1\u636E\u7F3A\u5931\uFF0C\u65E0\u6CD5\u786E\u8BA4\u540C\u4E00\u7269\u6599\uFF1B\u9700\u8865\u5145\u540E\u91CD\u65B0\u6CBB\u7406\u3002" : hardFilterPassed ? "\u5173\u952E\u89C4\u683C\u3001\u56FE\u53F7\u548C\u7248\u672C\u4E00\u81F4\uFF1B\u5DE5\u5382\u7F16\u7801\u548C\u91C7\u8D2D\u63CF\u8FF0\u5DEE\u5F02\u4E0D\u6539\u53D8\u7269\u6599\u8EAB\u4EFD\u3002" : "\u5173\u952E\u5C5E\u6027\u5B58\u5728\u4E0D\u53EF\u517C\u5BB9\u5DEE\u5F02\uFF0C\u4E0D\u80FD\u4EE5\u540D\u79F0\u76F8\u540C\u6216\u76F8\u4F3C\u5EA6\u9AD8\u4E3A\u7531\u5408\u5E76\u3002" };
}
function materialFingerprint(material2) {
  if (!compareMaterial(material2, material2).hardFilterPassed) throw new Error("identity_evidence_incomplete");
  const attributes = material2.attributes.map(normalizeAttribute).filter((a) => a.critical).sort((a, b) => a.key.localeCompare(b.key)).map((a) => [a.key, a.value, a.unit]);
  return createHash3("sha256").update(JSON.stringify([material2.category, material2.drawing, material2.revision, attributes])).digest("hex");
}
var goldenIdentity = (material2) => `GMI-${materialFingerprint(material2).slice(0, 16).toUpperCase()}`;

// src/lib/governance-domain.ts
function applyDomainStep(current, nodeKey, roleKey, now = (/* @__PURE__ */ new Date()).toISOString()) {
  const node = projectFlow(current).nodes.find((n) => n.key === nodeKey);
  if (!node || !node.executable || node.laneKey !== roleKey || node.executionMode !== "assistant_task") throw new Error("node_not_executable");
  const next = structuredClone(current);
  let summary = "";
  switch (nodeKey) {
    case "collect-evidence":
      summary = `\u5DF2\u5C01\u5B58 ${next.materials.length} \u6761\u6E90\u7269\u6599\u8BB0\u5F55\u53CA ${next.evidence.length} \u6761\u8BC1\u636E\uFF1B\u8BB0\u5F55 PLM\u3001ERP\u3001WMS \u6765\u6E90\u548C\u4FEE\u8BA2\u3002`;
      break;
    case "extract-drawing":
      for (const document of next.drawings) {
        const source = next.materials.find((m) => m.id === document.sourceId);
        const extracted = extractMockDrawing(document);
        if (!source || extracted.length !== source.attributes.length || extracted.some((a) => !source.attributes.some((b) => a.key === b.key && a.value === b.value && a.unit === b.unit))) throw new Error("drawing_attribute_mismatch");
      }
      if (next.materials.some((m) => !m.drawing || !m.attributes.length)) throw new Error("drawing_evidence_incomplete");
      summary = "\u5DF2\u4ECE Mock PLM \u53D1\u5E03\u56FE\u7EB8\u7684\u7ED3\u6784\u5316\u6807\u6CE8\u63D0\u53D6\u6750\u8D28\u3001\u5C3A\u5BF8\u3001\u516C\u5DEE\u76F8\u5173\u5C5E\u6027\uFF0C\u4FDD\u7559\u56FE\u53F7\u3001\u7248\u672C\u3001\u9875\u7801\u548C\u5B57\u6BB5\u6765\u6E90\u3002";
      break;
    case "normalize-material":
      next.materials = next.materials.map((m) => ({ ...m, attributes: m.attributes.map(normalizeAttribute) }));
      summary = "\u5DF2\u6309\u7C7B\u522B\u89C4\u5219\u5F52\u4E00\u8BA1\u91CF\u5355\u4F4D\u4E0E\u6750\u8D28\u522B\u540D\uFF0C\u4FDD\u7559\u539F\u59CB\u8BC1\u636E\u3002";
      break;
    case "match-identity": {
      const source = next.materials[0];
      if (!source) throw new Error("source_material_required");
      next.candidates = next.materials.slice(1).map((m) => compareMaterial(source, m));
      summary = `\u5DF2\u5B8C\u6210 ${next.candidates.length} \u4E2A\u5019\u9009\u7684\u9010\u5C5E\u6027\u6BD4\u5BF9\uFF1B${next.candidates.filter((c) => !c.hardFilterPassed).length} \u4E2A\u5019\u9009\u88AB\u5173\u952E\u5C5E\u6027\u89C4\u5219\u5426\u51B3\u3002`;
      break;
    }
    case "audit-conflicts": {
      next.criticalConflict = next.materials.some((a, i) => next.materials.slice(i + 1).some((b) => a.code === b.code && !compareMaterial(a, b).hardFilterPassed));
      summary = next.criticalConflict ? "\u786E\u8BA4\u540C\u4E00\u7F16\u7801\u7ED1\u5B9A\u4E0D\u540C\u6750\u8D28\u3001\u5C3A\u5BF8\u53CA\u56FE\u53F7\uFF1B\u751F\u6210\u9694\u79BB\u548C\u62C6\u5206\u5EFA\u8BAE\uFF0C\u672A\u7ECF\u5BA1\u6279\u4E0D\u5F97\u6539\u53D8\u91C7\u8D2D\u4E0E\u5E93\u5B58\u3002" : "\u672A\u53D1\u73B0\u540C\u4E00\u7801\u4E0B\u5173\u952E\u5C5E\u6027\u4E0D\u517C\u5BB9\uFF1B\u53EF\u7EE7\u7EED\u8BC4\u4F30\u8EAB\u4EFD\u6620\u5C04\u3002";
      break;
    }
    case "assess-impact":
      next.impacts = next.materials.flatMap((m, i) => [
        { system: "WMS", reference: `INV-${m.id}`, type: "inventory", description: `${m.plant} ${m.name}`, quantity: m.quantity, amount: m.quantity * m.unitCost, action: next.criticalConflict ? "\u6309\u56FE\u53F7\u6838\u9A8C\u6279\u6B21\uFF0C\u9694\u79BB\u6DF7\u7801\u5E93\u5B58\uFF0C\u4FDD\u7559\u65E7\u7801\u8FFD\u6EAF" : "\u4FDD\u7559\u672C\u5730\u5E93\u5B58\u7F16\u7801\uFF0C\u589E\u52A0\u5168\u5C40\u8EAB\u4EFD\u6620\u5C04" },
        { system: "MES", reference: `BOM-${m.drawing}`, type: "bom", description: `\u65B0\u80FD\u6E90\u4E58\u7528\u8F66 ${i === 0 ? "A" : "B"} \u5E73\u53F0\u88C5\u914D BOM`, quantity: i === 0 ? 6 : 4, amount: 0, action: next.criticalConflict ? "\u5BA1\u6279\u540E\u5EFA\u7ACB\u72EC\u7ACB\u66FF\u6362\u6E05\u5355\uFF0C\u4E0D\u76F4\u63A5\u4FEE\u6539\u5728\u5236 BOM" : "\u5F15\u7528\u7EDF\u4E00\u7269\u6599\u8EAB\u4EFD\uFF0C\u4FDD\u7559\u672C\u5730 BOM \u7F16\u7801" },
        { system: "SRM", reference: `PO-260905-${i + 1}`, type: "purchase", description: `${m.supplier} \u672A\u4EA4\u91C7\u8D2D\u8BA2\u5355`, quantity: 400, amount: 400 * m.unitCost, action: next.criticalConflict ? "\u5BA1\u6279\u540E\u963B\u6B62\u65E7\u51B2\u7A81\u7801\u65B0\u589E\u91C7\u8D2D\uFF0C\u8BA2\u5355\u6309\u89C4\u683C\u5206\u6D41" : "\u91C7\u8D2D\u63CF\u8FF0\u5F52\u4E00\uFF0C\u8BA2\u5355\u4FDD\u6301\u539F\u7F16\u7801" }
      ]);
      summary = `\u5B8C\u6210 ${next.impacts.length} \u9879 BOM\u3001\u5E93\u5B58\u53CA\u91C7\u8D2D\u5F71\u54CD\u6838\u5BF9\uFF1B\u6D89\u53CA\u5E93\u5B58\u91D1\u989D ${next.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0).toFixed(2)} \u5143\u3002`;
      break;
    case "propose-governance": {
      const same = next.candidates.some((c) => c.hardFilterPassed);
      const operation = next.criticalConflict ? "split_identity" : same ? next.kind === "drawing_request" ? "reuse_existing" : "map_aliases" : "new_identity";
      const identities = next.materials.map(goldenIdentity);
      const goldenIds = [...new Set(identities)];
      summary = operation === "split_identity" ? "\u4E3A\u5173\u952E\u5C5E\u6027\u4E0D\u540C\u7684\u7269\u6599\u5EFA\u7ACB\u72EC\u7ACB\u5168\u5C40\u8EAB\u4EFD\uFF0C\u6807\u8BB0\u65E7\u6DF7\u7801\u9700\u7BA1\u63A7\uFF1B\u6309\u56FE\u53F7\u4FDD\u7559\u6279\u6B21\u3001BOM \u4E0E\u5386\u53F2\u91C7\u8D2D\u8FFD\u6EAF\u3002" : operation === "reuse_existing" ? "\u590D\u7528\u5DF2\u5B58\u5728\u7684\u8F6C\u5411\u7535\u673A\u9694\u5957\u7269\u6599\u8EAB\u4EFD\uFF0C\u9A73\u56DE\u91CD\u590D\u5EFA\u7801\u9700\u8981\uFF0C\u4FDD\u7559\u7814\u53D1\u7533\u8BF7\u4E0E\u56FE\u7EB8\u8BC1\u636E\u3002" : operation === "new_identity" ? "\u6CA1\u6709\u53EF\u5408\u5E76\u7684\u6709\u6548\u5019\u9009\uFF0C\u4E3A\u5F53\u524D\u7269\u6599\u4FDD\u7559\u72EC\u7ACB\u5168\u5C40\u8EAB\u4EFD\u5E76\u5B8C\u6210\u5EFA\u7801\u5BA1\u6279\u3002" : "\u5C06\u8DE8\u5DE5\u5382\u672C\u5730\u7F16\u7801\u6620\u5C04\u5230\u540C\u4E00\u5168\u5C40\u7269\u6599\u8EAB\u4EFD\uFF0C\u5404\u5DE5\u5382\u5408\u6CD5\u672C\u5730\u7F16\u7801\u7EE7\u7EED\u4FDD\u7559\u3002";
      next.proposal = { revision: 1, operation, summary, goldenIds, mappings: next.materials.map((m, i) => ({ sourceId: m.id, localCode: m.code, plant: m.plant, goldenId: identities[i], relation: operation === "split_identity" ? "different" : "local_alias" })), safeguards: ["\u4EBA\u5DE5\u5BA1\u6279\u7ED1\u5B9A\u5F53\u524D\u65B9\u6848\u4FEE\u8BA2\uFF1B\u8BC1\u636E\u53D8\u5316\u540E\u539F\u6279\u51C6\u5931\u6548\u3002", "\u4FDD\u7559\u6765\u6E90\u8BB0\u5F55\u3001\u5386\u53F2\u7F16\u7801\u53CA\u6279\u6B21\u8FFD\u6EAF\uFF0C\u4E0D\u76F4\u63A5\u91CD\u5199\u5DF2\u6267\u884C\u4EA4\u6613\u3002", "\u5173\u952E\u5C5E\u6027\u51B2\u7A81\u4E0D\u5141\u8BB8\u5408\u5E76\uFF0C\u66FF\u4EE3\u548C\u7248\u672C\u7EE7\u627F\u5FC5\u987B\u72EC\u7ACB\u5EFA\u5173\u7CFB\u3002", "\u4EC5\u53D1\u5E03\u5230 Mock MDM / ERP\uFF1B\u5931\u8D25\u4FDD\u7559\u56DE\u6267\u5E76\u5141\u8BB8\u5E42\u7B49\u91CD\u8BD5\u3002"], evidenceIds: next.evidence.map((e) => e.id), confidence: same ? 1 : 0.99 };
      break;
    }
    case "publish-records":
      if (!next.proposal || next.approval?.decision !== "approved" || next.approval.proposalRevision !== next.proposal.revision) throw new Error("approval_required");
      if (next.publications.length < 2 || next.publications.some((p) => p.status !== "confirmed")) throw new Error("external_confirmation_required");
      summary = "Mock MDM \u4E0E ERP \u5DF2\u786E\u8BA4\u9EC4\u91D1\u8BB0\u5F55\u53CA\u7F16\u7801\u6620\u5C04\u3002\u5DF2\u4FDD\u7559\u5386\u53F2\u6765\u6E90\u3001\u5BA1\u6279\u548C\u5404\u7CFB\u7EDF\u56DE\u6267\u3002";
      break;
    default:
      throw new Error("unsupported_node");
  }
  next.artifacts.push({ key: node.artifactKey, revision: 1, status: "accepted", roleKey, summary, evidenceIds: next.evidence.map((e) => e.id), at: now });
  next.revision++;
  next.updatedAt = now;
  next.status = nodeKey === "publish-records" ? "completed" : nodeKey === "propose-governance" ? "review_required" : "active";
  return next;
}

// test/preview-fixture.ts
var time = "2026-09-05T02:00:00.000Z";
function advance(c, count) {
  let current = c;
  for (let i = 0; i < count; i++) {
    const node = projectFlow(current).nodes.find((n) => n.executable && n.executionMode === "assistant_task");
    if (!node) break;
    current = applyDomainStep(current, node.key, node.laneKey, time);
  }
  return current;
}
function initialState() {
  return { cases: [advance(createDemoCase("duplicate_codes", "00000000-0000-4000-8000-000000000101"), 7), advance(createDemoCase("code_collision", "00000000-0000-4000-8000-000000000102"), 7), createDemoCase("drawing_request", "00000000-0000-4000-8000-000000000103")], records: [], selectionId: "00000000-0000-4000-8000-000000000102", surface: "dashboard", requests: 0, actions: [], navigation: [] };
}
async function handleRequest(message, { state }) {
  if (message.type === "requestData") {
    state.requests++;
    if (message.query?.selectionId) state.selectionId = message.query.selectionId;
    const current = state.cases.find((c) => c.id === state.selectionId) ?? null;
    return { data: { surface: state.surface, table: { items: state.cases.map(({ id, caseKey, title, kind, status, revision, updatedAt }) => ({ id, caseKey, title, kind, status, revision, updatedAt })), total: state.cases.length, page: 1, pageSize: 20 }, selectedCase: current, flow: current ? projectFlow(current, state.records) : null, dashboard: projectDashboard(state.cases, state.records), canManage: true, canApprove: true, simulation: true } };
  }
  if (message.type === "invokeClientCommand") {
    state.navigation.push(message.payload ?? {});
    if (message.payload?.target === "workbench.view") {
      state.surface = message.payload.parameters?.surface ?? "pipeline";
      if (message.payload.selectionId) state.selectionId = message.payload.selectionId;
    }
    return { result: { success: true, code: "opened" } };
  }
  if (message.type === "executeAction") {
    const input = message.input;
    state.actions.push(message.actionKey);
    if (message.actionKey === "create_case") {
      const c2 = createDemoCase(input.kind ?? "duplicate_codes", `00000000-0000-4000-8000-${String(state.cases.length + 101).padStart(12, "0")}`, input.title);
      state.cases.push(c2);
      state.selectionId = c2.id;
      return { result: { success: true, code: "created", caseId: c2.id } };
    }
    const index = state.cases.findIndex((c2) => c2.id === input.caseId);
    const c = state.cases[index];
    if (!c) return { result: { success: false, code: "case_not_found" } };
    if (c.revision !== input.expectedRevision) return { result: { success: false, code: "stale_revision" } };
    if (message.actionKey === "decide_proposal") {
      if (!c.proposal || !input.reason?.trim()) return { result: { success: false, code: "reason_required" } };
      c.approval = { proposalRevision: c.proposal.revision, decision: input.decision, actor: "Preview reviewer", reason: input.reason, at: time };
      c.status = input.decision === "approved" ? "approved" : "rejected";
      c.revision++;
    } else {
      const node = projectFlow(c).nodes.find((n) => input.nodeKey ? n.key === input.nodeKey : n.executable && n.executionMode === "assistant_task");
      if (!node) return { result: { success: false, code: "no_executable_node" } };
      if (node.key === "publish-records") c.publications = ["MDM", "ERP"].map((system) => ({ system, operationId: `preview-${system}`, status: "confirmed", externalReference: `PREVIEW-${system}`, errorCode: null, at: time }));
      state.cases[index] = applyDomainStep(c, node.key, node.laneKey, time);
      state.records.push({ id: `preview-record-${state.records.length + 1}`, caseId: c.id, nodeKey: node.key, roleKey: node.laneKey, attempt: 1, sequence: state.records.length + 1, status: "succeeded", taskId: "preview-task", conversationId: "preview-conversation", threadId: "preview-thread", executionId: "preview-execution", inputRevision: c.revision, outputRevision: state.cases[index].revision, startedAt: time, finishedAt: time, safeSummary: "\u4EA4\u4E92\u539F\u578B\u6267\u884C\u6837\u4F8B\uFF0C\u4EC5\u7528\u4E8E\u68C0\u9A8C\u5E03\u5C40\u4E0E\u5BFC\u822A\u534F\u8BAE\u3002", supersededById: null });
    }
    return { result: { success: true, code: "accepted", caseId: c.id, revision: state.cases[index].revision } };
  }
  throw new Error("Unsupported preview operation");
}
export {
  handleRequest,
  initialState
};
