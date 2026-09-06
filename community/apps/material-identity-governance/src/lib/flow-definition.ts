// Generated from blueprints/pipeline.v1.json. Do not edit directly.
export const FLOW_DEFINITION = {
  "schemaVersion": "1.3",
  "pipeline": {
    "key": "material-identity-governance",
    "title": "物料主数据智能治理",
    "description": "汽车零部件制造的物料身份、编码别名、规格冲突与研发新增防重治理。",
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
      "rejected"
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
    "material_identity_publisher",
    "material_identity_workbench"
  ],
  "roles": [
    {
      "key": "coordinator",
      "title": "治理协调者",
      "kind": "orchestrator",
      "writeAuthority": false,
      "assistantTemplateKey": "material-identity-coordinator",
      "middlewareBindings": [
        "material_identity_coordinator"
      ]
    },
    {
      "key": "intake",
      "title": "数据采集专员",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-intake",
      "middlewareBindings": [
        "material_identity_intake"
      ]
    },
    {
      "key": "engineering",
      "title": "研发图纸工程师",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-engineering",
      "middlewareBindings": [
        "material_identity_engineering"
      ]
    },
    {
      "key": "standardization",
      "title": "物料标准化工程师",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-standardization",
      "middlewareBindings": [
        "material_identity_standardization"
      ]
    },
    {
      "key": "quality",
      "title": "质量冲突审计员",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-quality",
      "middlewareBindings": [
        "material_identity_quality"
      ]
    },
    {
      "key": "impact",
      "title": "供应链影响分析师",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-impact",
      "middlewareBindings": [
        "material_identity_impact"
      ]
    },
    {
      "key": "governance",
      "title": "主数据治理专员",
      "kind": "business",
      "writeAuthority": true,
      "assistantTemplateKey": "material-identity-governance",
      "middlewareBindings": [
        "material_identity_governance"
      ]
    },
    {
      "key": "publisher",
      "title": "系统发布与监控专员",
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
      "title": "数据采集专员",
      "accountableRoleKey": "intake",
      "order": 10
    },
    {
      "key": "engineering",
      "title": "研发图纸工程师",
      "accountableRoleKey": "engineering",
      "order": 20
    },
    {
      "key": "standardization",
      "title": "物料标准化工程师",
      "accountableRoleKey": "standardization",
      "order": 30
    },
    {
      "key": "quality",
      "title": "质量冲突审计员",
      "accountableRoleKey": "quality",
      "order": 40
    },
    {
      "key": "impact",
      "title": "供应链影响分析师",
      "accountableRoleKey": "impact",
      "order": 50
    },
    {
      "key": "governance",
      "title": "主数据治理专员",
      "accountableRoleKey": "governance",
      "order": 60
    },
    {
      "key": "publisher",
      "title": "系统发布与监控专员",
      "accountableRoleKey": "publisher",
      "order": 70
    }
  ],
  "stages": [
    {
      "key": "intake",
      "title": "来源取证",
      "order": 0
    },
    {
      "key": "understand",
      "title": "技术理解",
      "order": 10
    },
    {
      "key": "identify",
      "title": "身份核验",
      "order": 20
    },
    {
      "key": "assess",
      "title": "风险与影响",
      "order": 30
    },
    {
      "key": "decide",
      "title": "治理审批",
      "order": 40
    },
    {
      "key": "publish",
      "title": "发布闭环",
      "order": 50
    }
  ],
  "artifacts": [
    {
      "key": "evidence",
      "title": "采集跨系统证据",
      "ownerRoleKey": "intake",
      "versioned": true
    },
    {
      "key": "drawing",
      "title": "识别图纸与关键属性",
      "ownerRoleKey": "engineering",
      "versioned": true
    },
    {
      "key": "normalized",
      "title": "统一术语与计量单位",
      "ownerRoleKey": "standardization",
      "versioned": true
    },
    {
      "key": "candidates",
      "title": "召回候选与身份判定",
      "ownerRoleKey": "standardization",
      "versioned": true
    },
    {
      "key": "audit",
      "title": "审计同码规格冲突",
      "ownerRoleKey": "quality",
      "versioned": true
    },
    {
      "key": "impact",
      "title": "分析 BOM、库存与采购影响",
      "ownerRoleKey": "impact",
      "versioned": true
    },
    {
      "key": "proposal",
      "title": "形成可解释治理建议",
      "ownerRoleKey": "governance",
      "versioned": true
    },
    {
      "key": "approval",
      "title": "人工批准治理方案",
      "ownerRoleKey": "governance",
      "versioned": true
    },
    {
      "key": "publication",
      "title": "发布黄金记录与编码映射",
      "ownerRoleKey": "publisher",
      "versioned": true
    },
    {
      "key": "containment",
      "title": "冲突隔离建议",
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
      "title": "治理监控",
      "kind": "operations_dashboard",
      "featureKeys": [
        "material_identity_workbench"
      ],
      "actionKeys": [
        "create_case",
        "coordinate_next",
        "run_node",
        "decide_proposal",
        "retry_project"
      ],
      "clientCommandKeys": [
        "workbench.navigation.open"
      ]
    },
    {
      "key": "material_identity_pipeline_overview",
      "title": "案例协同流水线",
      "kind": "pipeline_overview",
      "featureKeys": [
        "material_identity_workbench"
      ],
      "actionKeys": [
        "create_case",
        "coordinate_next",
        "run_node",
        "decide_proposal",
        "retry_project"
      ],
      "clientCommandKeys": [
        "workbench.navigation.open"
      ]
    },
    {
      "key": "material_identity_case_workspace",
      "title": "证据与治理审批",
      "kind": "node_workspace",
      "featureKeys": [
        "material_identity_workbench"
      ],
      "actionKeys": [
        "create_case",
        "coordinate_next",
        "run_node",
        "decide_proposal",
        "retry_project"
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
      "title": "采集跨系统证据",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "extract-drawing",
      "title": "识别图纸与关键属性",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "normalize-material",
      "title": "统一术语与计量单位",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "match-identity",
      "title": "召回候选与身份判定",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "audit-conflicts",
      "title": "审计同码规格冲突",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "assess-impact",
      "title": "分析 BOM、库存与采购影响",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "propose-governance",
      "title": "形成可解释治理建议",
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
        "run_node"
      ],
      "risk": "medium",
      "humanGate": "none",
      "workspaceKey": "material_identity_case_workspace"
    },
    {
      "key": "approve-governance",
      "title": "人工批准治理方案",
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
        "decide_proposal"
      ],
      "risk": "high",
      "humanGate": "approval",
      "workspaceKey": "material_identity_case_workspace"
    },
    {
      "key": "publish-records",
      "title": "发布黄金记录与编码映射",
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
        "run_node"
      ],
      "risk": "high",
      "humanGate": "external_confirmation"
    },
    {
      "key": "route-conflict",
      "title": "关键属性存在冲突？",
      "kind": "router",
      "stageKey": "assess",
      "routeFactKey": "critical-conflict"
    },
    {
      "key": "contain-conflict",
      "title": "标记隔离与拆分范围",
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
      "allowedActionKeys": [],
      "risk": "medium",
      "humanGate": "none"
    },
    {
      "key": "governed",
      "title": "治理完成",
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
} as const
