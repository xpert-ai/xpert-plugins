import type { CrmObjectDefinitionInput } from './types'

export const DEFAULT_CRM_OBJECTS: CrmObjectDefinitionInput[] = [
  {
    objectKey: 'company',
    label: 'Company',
    pluralLabel: 'Companies',
    icon: 'ri-building-4-line',
    description: 'Accounts and organizations in the CRM workspace.',
    displayOrder: 10,
    fields: [
      { objectKey: 'company', fieldKey: 'name', type: 'text', label: 'Name', required: true, displayOrder: 10 },
      { objectKey: 'company', fieldKey: 'domain', type: 'url', label: 'Domain', displayOrder: 20 },
      { objectKey: 'company', fieldKey: 'industry', type: 'text', label: 'Industry', displayOrder: 30 },
      {
        objectKey: 'company',
        fieldKey: 'status',
        type: 'select',
        label: 'Status',
        defaultValue: 'active',
        options: [
          { value: 'lead', label: 'Lead', color: '#f59e0b' },
          { value: 'active', label: 'Active', color: '#0f766e' },
          { value: 'customer', label: 'Customer', color: '#2563eb' },
          { value: 'inactive', label: 'Inactive', color: '#64748b' }
        ],
        displayOrder: 40
      },
      { objectKey: 'company', fieldKey: 'owner', type: 'text', label: 'Owner', displayOrder: 50 }
    ]
  },
  {
    objectKey: 'person',
    label: 'Person',
    pluralLabel: 'People',
    icon: 'ri-contacts-line',
    description: 'Contacts and stakeholders connected to companies.',
    displayOrder: 20,
    fields: [
      { objectKey: 'person', fieldKey: 'firstName', type: 'text', label: 'First name', required: true, displayOrder: 10 },
      { objectKey: 'person', fieldKey: 'lastName', type: 'text', label: 'Last name', displayOrder: 20 },
      { objectKey: 'person', fieldKey: 'email', type: 'email', label: 'Email', displayOrder: 30 },
      { objectKey: 'person', fieldKey: 'phone', type: 'phone', label: 'Phone', displayOrder: 40 },
      {
        objectKey: 'person',
        fieldKey: 'companyId',
        type: 'relation',
        label: 'Company',
        relationObjectKey: 'company',
        displayOrder: 50
      },
      { objectKey: 'person', fieldKey: 'title', type: 'text', label: 'Title', displayOrder: 60 }
    ]
  },
  {
    objectKey: 'opportunity',
    label: 'Opportunity',
    pluralLabel: 'Opportunities',
    icon: 'ri-line-chart-line',
    description: 'Sales opportunities and pipeline deals.',
    displayOrder: 30,
    fields: [
      { objectKey: 'opportunity', fieldKey: 'name', type: 'text', label: 'Name', required: true, displayOrder: 10 },
      {
        objectKey: 'opportunity',
        fieldKey: 'companyId',
        type: 'relation',
        label: 'Company',
        relationObjectKey: 'company',
        displayOrder: 20
      },
      {
        objectKey: 'opportunity',
        fieldKey: 'stage',
        type: 'select',
        label: 'Stage',
        defaultValue: 'discovery',
        options: [
          { value: 'discovery', label: 'Discovery', color: '#38bdf8' },
          { value: 'proposal', label: 'Proposal', color: '#a855f7' },
          { value: 'negotiation', label: 'Negotiation', color: '#f59e0b' },
          { value: 'won', label: 'Won', color: '#16a34a' },
          { value: 'lost', label: 'Lost', color: '#dc2626' }
        ],
        displayOrder: 30
      },
      { objectKey: 'opportunity', fieldKey: 'amount', type: 'currency', label: 'Amount', displayOrder: 40 },
      { objectKey: 'opportunity', fieldKey: 'closeDate', type: 'date', label: 'Close date', displayOrder: 50 },
      { objectKey: 'opportunity', fieldKey: 'owner', type: 'text', label: 'Owner', displayOrder: 60 }
    ]
  },
  {
    objectKey: 'task',
    label: 'Task',
    pluralLabel: 'Tasks',
    icon: 'ri-checkbox-circle-line',
    description: 'Follow-up tasks for CRM work.',
    displayOrder: 40,
    fields: [
      { objectKey: 'task', fieldKey: 'title', type: 'text', label: 'Title', required: true, displayOrder: 10 },
      {
        objectKey: 'task',
        fieldKey: 'status',
        type: 'select',
        label: 'Status',
        defaultValue: 'open',
        options: [
          { value: 'open', label: 'Open', color: '#2563eb' },
          { value: 'done', label: 'Done', color: '#16a34a' }
        ],
        displayOrder: 20
      },
      { objectKey: 'task', fieldKey: 'dueDate', type: 'date', label: 'Due date', displayOrder: 30 },
      { objectKey: 'task', fieldKey: 'recordId', type: 'text', label: 'Related record', displayOrder: 40 }
    ]
  },
  {
    objectKey: 'note',
    label: 'Note',
    pluralLabel: 'Notes',
    icon: 'ri-sticky-note-line',
    description: 'Lightweight CRM notes.',
    displayOrder: 50,
    fields: [
      { objectKey: 'note', fieldKey: 'title', type: 'text', label: 'Title', required: true, displayOrder: 10 },
      { objectKey: 'note', fieldKey: 'content', type: 'rich_text', label: 'Content', displayOrder: 20 },
      { objectKey: 'note', fieldKey: 'recordId', type: 'text', label: 'Related record', displayOrder: 30 }
    ]
  }
]

export const DEFAULT_CRM_VIEW_COLUMNS: Record<string, string[]> = {
  company: ['name', 'domain', 'industry', 'status', 'owner'],
  person: ['firstName', 'lastName', 'email', 'phone', 'companyId'],
  opportunity: ['name', 'companyId', 'stage', 'amount', 'closeDate', 'owner'],
  task: ['title', 'status', 'dueDate', 'recordId'],
  note: ['title', 'content', 'recordId']
}
