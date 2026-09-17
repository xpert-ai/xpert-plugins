import { Button, ControlInput, DialogSurface } from './controls'
import { translate } from './i18n'
import type { DatabaseObjectRef } from '@xpert-ai/plugin-sdk/data-workbench'
export interface ConnectionPolicy {
  revision: number
  readOnly: boolean
  autoActions: ('row-update' | 'import')[]
  objects: DatabaseObjectRef[]
}
export function PolicyDialog({
  policy,
  setPolicy,
  objects,
  testMode,
  zh,
  onClose,
  onSave,
}: {
  policy: ConnectionPolicy
  setPolicy: (value: ConnectionPolicy) => void
  objects: DatabaseObjectRef[]
  testMode: boolean
  zh: boolean
  onClose: () => void
  onSave: () => void
}) {
  const key = (object: DatabaseObjectRef) =>
    JSON.stringify([object.database, object.schema, object.engineCatalog ?? 'internal', object.name, object.kind])
  return (
    <DialogSurface
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={translate(zh, 'm_3106be63')}
      description={translate(zh, 'm_a5973bd3')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{translate(zh, 'm_fbd8cee0')}</Button>
        <Button size="sm" disabled={testMode} onClick={onSave}>{translate(zh, 'm_5c5e112a')}</Button>
      </>}
    >
      <label>
        <ControlInput
          type="checkbox"
          checked={policy.readOnly}
          disabled={testMode}
          onChange={(event) => setPolicy({ ...policy, readOnly: event.target.checked })}
        />
        {translate(zh, 'm_35fda43d')}
      </label>
      <fieldset disabled={testMode || policy.readOnly}>
        <legend>{translate(zh, 'm_ac8af3d3')}</legend>
        {(['row-update', 'import'] as const).map((action) => (
          <label key={action}>
            <ControlInput
              type="checkbox"
              checked={policy.autoActions.includes(action)}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  autoActions: event.target.checked
                    ? [...policy.autoActions, action]
                    : policy.autoActions.filter((item) => item !== action),
                })
              }
            />
            {action === 'row-update' ? translate(zh, 'm_7e416e94') : translate(zh, 'm_83e6ed0e')}
          </label>
        ))}
        <legend>{translate(zh, 'm_f9905f68')}</legend>
        <div className="policy-objects">
          {objects
            .filter((object) => object.kind === 'table')
            .map((object) => (
              <label key={key(object)}>
                <ControlInput
                  type="checkbox"
                  checked={policy.objects.some((item) => key(item) === key(object))}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      objects: event.target.checked
                        ? [...policy.objects, object]
                        : policy.objects.filter((item) => key(item) !== key(object)),
                    })
                  }
                />
                {[object.database, object.schema, object.name].filter(Boolean).join('.')}
              </label>
            ))}
        </div>
        <p>
          {policy.objects.length} {translate(zh, 'm_033b8e8d')}
        </p>
        <Button onClick={() => setPolicy({ ...policy, objects: [], autoActions: [] })}>
          {translate(zh, 'm_c305949e')}
        </Button>
      </fieldset>
      <p className="muted">{translate(zh, 'm_039805d3')}</p>
    </DialogSurface>
  )
}
