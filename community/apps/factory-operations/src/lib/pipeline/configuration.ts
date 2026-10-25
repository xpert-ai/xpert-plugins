import { Injectable } from '@nestjs/common'
import { ProjectPipelineContributor } from '@xpert-ai/plugin-sdk'
import { projectPipelineConfigurationSchema, type ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'
import { FACTORY_CASE_PROJECT_TYPE } from '../factory-project-type.js'
export const refs = {"subject": "factory_ops.case@1", "evidence": "factory_ops.evidence@1", "result": "factory_ops.result@1", "approval": "factory_ops.approval@1"} as const
export const steps = [["triage-event", "anomaly-triage-specialist"], ["diagnose-equipment", "equipment-diagnostics-specialist"], ["assess-quality-impact", "quality-risk-specialist"], ["assess-production-impact", "production-impact-specialist"], ["check-resource-readiness", "resource-readiness-specialist"], ["generate-recovery-plan", "recovery-planning-specialist"], ["verify-recovery", "recovery-verification-specialist"]] as const
export type FactoryStep = typeof steps[number][0]
const template = {
  "schemaVersion": 1,
  "template": {
    "key": "factory_ops.recovery",
    "version": "1.0.0",
    "title": "工厂异常恢复",
    "executionAuthority": "platform",
    "subjectResolverRef": "factory_ops.case@1",
    "topology": {
      "source": "definition"
    },
    "roles": [
      {
        "key": "anomaly-triage-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "equipment-diagnostics-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "quality-risk-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "production-impact-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "resource-readiness-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "recovery-planning-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "recovery-verification-specialist",
        "allowedKinds": [
          "assistant"
        ]
      },
      {
        "key": "system",
        "allowedKinds": [
          "service"
        ]
      },
      {
        "key": "approver",
        "allowedKinds": [
          "human"
        ]
      }
    ],
    "lanes": [
      {
        "key": "anomaly-triage-specialist",
        "roleKey": "anomaly-triage-specialist",
        "label": "Triage Anomaly Event",
        "order": 0
      },
      {
        "key": "equipment-diagnostics-specialist",
        "roleKey": "equipment-diagnostics-specialist",
        "label": "Diagnose Equipment",
        "order": 1
      },
      {
        "key": "quality-risk-specialist",
        "roleKey": "quality-risk-specialist",
        "label": "Assess Quality Impact",
        "order": 2
      },
      {
        "key": "production-impact-specialist",
        "roleKey": "production-impact-specialist",
        "label": "Assess Production Impact",
        "order": 3
      },
      {
        "key": "resource-readiness-specialist",
        "roleKey": "resource-readiness-specialist",
        "label": "Check Resource Readiness",
        "order": 4
      },
      {
        "key": "recovery-planning-specialist",
        "roleKey": "recovery-planning-specialist",
        "label": "Generate Recovery Plan",
        "order": 5
      },
      {
        "key": "recovery-verification-specialist",
        "roleKey": "recovery-verification-specialist",
        "label": "Verify Production Recovery",
        "order": 6
      },
      {
        "key": "system",
        "roleKey": "system",
        "label": "规则与执行",
        "order": 8
      },
      {
        "key": "approver",
        "roleKey": "approver",
        "label": "人工审批",
        "order": 6
      }
    ],
    "stages": [
      {
        "key": "detection",
        "label": "Detection",
        "order": 10
      },
      {
        "key": "triage",
        "label": "Triage",
        "order": 20
      },
      {
        "key": "parallel-analysis",
        "label": "Parallel Analysis",
        "order": 30
      },
      {
        "key": "recovery-planning",
        "label": "Recovery Planning",
        "order": 40
      },
      {
        "key": "human-decision",
        "label": "Human Decision",
        "order": 50
      },
      {
        "key": "governed-execution",
        "label": "Governed Execution",
        "order": 60
      },
      {
        "key": "verification",
        "label": "Verification and Outcome",
        "order": 70
      }
    ],
    "nodes": [
      {
        "key": "triage-event",
        "kind": "work",
        "stageKey": "triage",
        "laneKey": "anomaly-triage-specialist",
        "executorSlot": "anomaly-triage-specialist",
        "operationRef": "factory_ops.triage-event@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Triage Anomaly Event"
      },
      {
        "key": "diagnose-equipment",
        "kind": "work",
        "stageKey": "parallel-analysis",
        "laneKey": "equipment-diagnostics-specialist",
        "executorSlot": "equipment-diagnostics-specialist",
        "operationRef": "factory_ops.diagnose-equipment@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Diagnose Equipment"
      },
      {
        "key": "assess-quality-impact",
        "kind": "work",
        "stageKey": "parallel-analysis",
        "laneKey": "quality-risk-specialist",
        "executorSlot": "quality-risk-specialist",
        "operationRef": "factory_ops.assess-quality-impact@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Assess Quality Impact"
      },
      {
        "key": "assess-production-impact",
        "kind": "work",
        "stageKey": "parallel-analysis",
        "laneKey": "production-impact-specialist",
        "executorSlot": "production-impact-specialist",
        "operationRef": "factory_ops.assess-production-impact@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Assess Production Impact"
      },
      {
        "key": "check-resource-readiness",
        "kind": "work",
        "stageKey": "parallel-analysis",
        "laneKey": "resource-readiness-specialist",
        "executorSlot": "resource-readiness-specialist",
        "operationRef": "factory_ops.check-resource-readiness@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Check Resource Readiness"
      },
      {
        "key": "generate-recovery-plan",
        "kind": "work",
        "stageKey": "recovery-planning",
        "laneKey": "recovery-planning-specialist",
        "executorSlot": "recovery-planning-specialist",
        "operationRef": "factory_ops.generate-recovery-plan@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Generate Recovery Plan"
      },
      {
        "key": "verify-recovery",
        "kind": "work",
        "stageKey": "verification",
        "laneKey": "recovery-verification-specialist",
        "executorSlot": "recovery-verification-specialist",
        "operationRef": "factory_ops.verify-recovery@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        },
        "label": "Verify Production Recovery"
      },
      {
        "key": "detect-anomaly",
        "label": "接收异常事件",
        "kind": "work",
        "stageKey": "detection",
        "laneKey": "system",
        "executorSlot": "service",
        "operationRef": "factory_ops.detect-anomaly@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        }
      },
      {
        "key": "analysis-fork",
        "label": "启动专业分析",
        "kind": "fork",
        "stageKey": "parallel-analysis"
      },
      {
        "key": "analysis-join",
        "label": "汇合专业结论",
        "kind": "join",
        "stageKey": "recovery-planning",
        "join": {
          "mode": "all_selected",
          "accept": "completed"
        }
      },
      {
        "key": "approve-recovery-plan",
        "label": "人工审批恢复方案",
        "kind": "human_gate",
        "laneKey": "approver",
        "stageKey": "human-decision",
        "policyRef": "factory_ops.approval@1",
        "candidateRoleKey": "approver",
        "outcomes": [
          "approved",
          "rejected"
        ],
        "outcomeLabels": {
          "approved": "批准当前恢复方案",
          "rejected": "拒绝当前恢复方案"
        },
        "inputBindings": {
          "plan": {
            "from": "node_output",
            "nodeKey": "generate-recovery-plan",
            "port": "result"
          }
        },
        "outputPorts": {
          "decision": "platform.human-decision@1"
        }
      },
      {
        "key": "record-approval",
        "label": "记录批准结果",
        "kind": "work",
        "stageKey": "human-decision",
        "laneKey": "system",
        "executorSlot": "service",
        "operationRef": "factory_ops.record-approval@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          },
          "approval": {
            "from": "node_output",
            "nodeKey": "approve-recovery-plan",
            "port": "decision"
          },
          "plan": {
            "from": "node_output",
            "nodeKey": "generate-recovery-plan",
            "port": "result"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        }
      },
      {
        "key": "record-rejection",
        "label": "记录拒绝结果",
        "kind": "work",
        "stageKey": "human-decision",
        "laneKey": "system",
        "executorSlot": "service",
        "operationRef": "factory_ops.record-rejection@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          },
          "approval": {
            "from": "node_output",
            "nodeKey": "approve-recovery-plan",
            "port": "decision"
          },
          "plan": {
            "from": "node_output",
            "nodeKey": "generate-recovery-plan",
            "port": "result"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        }
      },
      {
        "key": "execute-recovery-plan",
        "label": "执行已批准方案",
        "kind": "work",
        "stageKey": "governed-execution",
        "laneKey": "system",
        "executorSlot": "service",
        "operationRef": "factory_ops.execute-recovery-plan@1",
        "completionRef": "platform.output-validated@1",
        "inputBindings": {
          "subject": {
            "from": "subject"
          },
          "approval": {
            "from": "node_output",
            "nodeKey": "record-approval",
            "port": "result"
          }
        },
        "outputPorts": {
          "result": "factory_ops.result@1"
        }
      },
      {
        "key": "route-execution-outcome",
        "label": "检查执行结果",
        "kind": "router",
        "stageKey": "governed-execution",
        "policyRef": "factory_ops.execution-outcome@1",
        "outcomes": [
          "complete",
          "partial-failure"
        ],
        "unmatched": "block",
        "inputBindings": {
          "result": {
            "from": "node_output",
            "nodeKey": "execute-recovery-plan",
            "port": "result"
          }
        }
      },
      {
        "key": "route-recovery-outcome",
        "label": "检查恢复结果",
        "kind": "router",
        "stageKey": "verification",
        "policyRef": "factory_ops.recovery-outcome@1",
        "outcomes": [
          "recovered",
          "needs-intervention"
        ],
        "unmatched": "block",
        "inputBindings": {
          "result": {
            "from": "node_output",
            "nodeKey": "verify-recovery",
            "port": "result"
          }
        }
      },
      {
        "key": "production-recovered",
        "label": "生产已恢复",
        "kind": "terminal",
        "stageKey": "verification",
        "outcome": "recovered"
      },
      {
        "key": "human-intervention-required",
        "label": "等待人工处置",
        "kind": "terminal",
        "stageKey": "verification",
        "outcome": "intervention",
        "disposition": "await_new_subject"
      }
    ],
    "edges": [
      {
        "from": "detect-anomaly",
        "to": "triage-event"
      },
      {
        "from": "triage-event",
        "to": "analysis-fork"
      },
      {
        "from": "analysis-fork",
        "to": "diagnose-equipment"
      },
      {
        "from": "diagnose-equipment",
        "to": "analysis-join"
      },
      {
        "from": "analysis-fork",
        "to": "assess-quality-impact"
      },
      {
        "from": "assess-quality-impact",
        "to": "analysis-join"
      },
      {
        "from": "analysis-fork",
        "to": "assess-production-impact"
      },
      {
        "from": "assess-production-impact",
        "to": "analysis-join"
      },
      {
        "from": "analysis-fork",
        "to": "check-resource-readiness"
      },
      {
        "from": "check-resource-readiness",
        "to": "analysis-join"
      },
      {
        "from": "analysis-join",
        "to": "generate-recovery-plan"
      },
      {
        "from": "generate-recovery-plan",
        "to": "approve-recovery-plan"
      },
      {
        "from": "approve-recovery-plan",
        "to": "record-approval",
        "outcome": "approved"
      },
      {
        "from": "approve-recovery-plan",
        "to": "record-rejection",
        "outcome": "rejected"
      },
      {
        "from": "record-rejection",
        "to": "human-intervention-required"
      },
      {
        "from": "record-approval",
        "to": "execute-recovery-plan"
      },
      {
        "from": "execute-recovery-plan",
        "to": "route-execution-outcome"
      },
      {
        "from": "route-execution-outcome",
        "to": "verify-recovery",
        "outcome": "complete"
      },
      {
        "from": "route-execution-outcome",
        "to": "human-intervention-required",
        "outcome": "partial-failure"
      },
      {
        "from": "verify-recovery",
        "to": "route-recovery-outcome"
      },
      {
        "from": "route-recovery-outcome",
        "to": "production-recovered",
        "outcome": "recovered"
      },
      {
        "from": "route-recovery-outcome",
        "to": "human-intervention-required",
        "outcome": "needs-intervention"
      }
    ],
    "roundPolicy": {
      "entryNodeKey": "detect-anomaly",
      "maxRounds": 20,
      "onRework": "await_new_subject_then_next_round",
      "onLimit": "attention",
      "newVersionWhileActive": "supersede_round",
      "terminalOutcomes": [
        "recovered"
      ]
    },
    "failurePolicy": {
      "requiredNodeFailure": "block_and_attention",
      "unknownExecution": "inspect_without_replay"
    }
  },
  "binding": {
    "templateRef": "factory_ops.recovery@1.0.0",
    "roleBindings": {
      "approver": {
        "kind": "human",
        "selectionKey": "project-managers"
      }
    },
    "executorBindings": {
      "anomaly-triage-specialist": {
        "kind": "assistant",
        "roleKey": "anomaly-triage-specialist",
        "selectionKey": "select-anomaly-triage-specialist"
      },
      "equipment-diagnostics-specialist": {
        "kind": "assistant",
        "roleKey": "equipment-diagnostics-specialist",
        "selectionKey": "select-equipment-diagnostics-specialist"
      },
      "quality-risk-specialist": {
        "kind": "assistant",
        "roleKey": "quality-risk-specialist",
        "selectionKey": "select-quality-risk-specialist"
      },
      "production-impact-specialist": {
        "kind": "assistant",
        "roleKey": "production-impact-specialist",
        "selectionKey": "select-production-impact-specialist"
      },
      "resource-readiness-specialist": {
        "kind": "assistant",
        "roleKey": "resource-readiness-specialist",
        "selectionKey": "select-resource-readiness-specialist"
      },
      "recovery-planning-specialist": {
        "kind": "assistant",
        "roleKey": "recovery-planning-specialist",
        "selectionKey": "select-recovery-planning-specialist"
      },
      "recovery-verification-specialist": {
        "kind": "assistant",
        "roleKey": "recovery-verification-specialist",
        "selectionKey": "select-recovery-verification-specialist"
      },
      "service": {
        "kind": "service",
        "roleKey": "system",
        "selectionKey": "factory-services"
      }
    },
    "parameters": {},
    "limits": {
      "maxConcurrentExecutions": 4,
      "maxTechnicalAttemptsPerNode": 2,
      "runTimeoutMinutes": 180
    }
  }
}
export function factoryConfiguration(assistants: Record<string, string> = {}) {
  const configuration = structuredClone(template)
  for (const executor of Object.values(configuration.binding.executorBindings))
    if (executor.kind === 'assistant') executor.selectionKey = assistants[executor.roleKey] ?? executor.selectionKey
  return projectPipelineConfigurationSchema.parse({ ...configuration, template: { ...configuration.template, projectTypes: [FACTORY_CASE_PROJECT_TYPE] } })
}
export const factoryDescriptors: ProjectPipelineExtensionDescriptor[] = [
  {
    "kind": "schema",
    "ref": "factory_ops.result@1"
  },
  {
    "kind": "subject",
    "ref": "factory_ops.case@1",
    "outputSchemaRef": "factory_ops.result@1"
  },
  {
    "kind": "operation",
    "ref": "factory_ops.triage-event@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.diagnose-equipment@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.assess-quality-impact@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.assess-production-impact@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.check-resource-readiness@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.generate-recovery-plan@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.verify-recovery@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.detect-anomaly@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "policy",
    "ref": "factory_ops.approval@1",
    "outcomes": [
      "approved",
      "rejected"
    ]
  },
  {
    "kind": "operation",
    "ref": "factory_ops.record-approval@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      },
      "approval": {
        "schemaRef": "platform.human-decision@1",
        "cardinality": "one"
      },
      "plan": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.record-rejection@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      },
      "approval": {
        "schemaRef": "platform.human-decision@1",
        "cardinality": "one"
      },
      "plan": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "operation",
    "ref": "factory_ops.execute-recovery-plan@1",
    "effects": "isolated_write",
    "idempotency": "keyed_receipt",
    "retry": "after_confirmed_failure",
    "requiredCapabilities": [],
    "inputs": {
      "subject": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      },
      "approval": {
        "schemaRef": "factory_ops.result@1",
        "cardinality": "one"
      }
    },
    "outputs": {
      "result": "factory_ops.result@1"
    }
  },
  {
    "kind": "policy",
    "ref": "factory_ops.execution-outcome@1",
    "outcomes": [
      "complete",
      "partial-failure"
    ]
  },
  {
    "kind": "policy",
    "ref": "factory_ops.recovery-outcome@1",
    "outcomes": [
      "recovered",
      "needs-intervention"
    ]
  }
]
@Injectable() @ProjectPipelineContributor('factory_ops')
export class FactoryPipelineContribution {
  readonly key = 'factory_ops'
  readonly configurations = [factoryConfiguration()]
  readonly descriptors = factoryDescriptors
}
