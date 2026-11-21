/**
 * 新建请求对话框（产品设计 5.2 节）：必填校验、日期规则、演示故障开关。
 *
 * 校验分两层：界面先按同样的规则检查一遍（即时提示，少一次往返）；
 * 服务端仍会再校验一次（zod + 日期规则 + 订单号唯一），返回的字段错误码也映射到对应字段下显示。
 * Python 类比：前端做表单提示，后端 pydantic 才是最终把关。
 */
import * as React from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { ActionError } from './bridge'
import { describeCode } from './i18n'
import type { MessageKey, Translate } from './i18n'
import type { FormOptions } from './types'

type FieldName = 'orderNo' | 'customerName' | 'productCode' | 'quantity' | 'originalDueDate' | 'targetDate'

interface FormState {
  orderNo: string
  customerName: string
  productCode: string
  quantity: string
  originalDueDate: string
  targetDate: string
  remark: string
  demoFailInventoryOnce: boolean
}

const EMPTY: FormState = {
  orderNo: '',
  customerName: '',
  productCode: '',
  quantity: '',
  originalDueDate: '',
  targetDate: '',
  remark: '',
  demoFailInventoryOnce: false
}

const FIELD_LABEL: Record<FieldName, MessageKey> = {
  orderNo: 'form.orderNo',
  customerName: 'form.customer',
  productCode: 'form.product',
  quantity: 'form.quantity',
  originalDueDate: 'form.originalDueDate',
  targetDate: 'form.targetDate'
}

/** 界面侧校验：返回 字段 → 提示文案 */
function validate(form: FormState, options: FormOptions, t: Translate) {
  const errors: Partial<Record<FieldName, string>> = {}
  for (const field of Object.keys(FIELD_LABEL) as FieldName[]) {
    if (!form[field].trim()) errors[field] = t('form.required', { field: t(FIELD_LABEL[field]) })
  }
  const quantity = Number(form.quantity)
  if (form.quantity.trim() && (!Number.isInteger(quantity) || quantity < 1)) errors.quantity = t('form.quantityInvalid')
  if (!errors.targetDate && !errors.originalDueDate) {
    // 日期是 YYYY-MM-DD 字符串，可以直接按字典序比较
    if (form.targetDate >= form.originalDueDate) errors.targetDate = t('form.targetNotEarlier')
    else if (form.targetDate <= options.asOfDate) errors.targetDate = t('form.targetInPast', { date: options.asOfDate })
  }
  return errors
}

/** 服务端返回的字段错误码 → 提示文案 */
function serverFieldMessage(field: FieldName, code: string, options: FormOptions, t: Translate) {
  if (code === 'target_not_earlier') return t('form.targetNotEarlier')
  if (code === 'target_in_past') return t('form.targetInPast', { date: options.asOfDate })
  if (code === 'unknown_product') return t('form.unknownProduct')
  if (field === 'quantity') return t('form.quantityInvalid')
  return t('form.required', { field: t(FIELD_LABEL[field]) })
}

export function NewRequestDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: FormOptions
  t: Translate
  onSubmit: (input: Record<string, unknown>) => Promise<void>
}) {
  const { t, options } = props
  const [form, setForm] = React.useState<FormState>(EMPTY)
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // 每次打开都从空表单开始
  React.useEffect(() => {
    if (props.open) {
      setForm(EMPTY)
      setErrors({})
      setFormError(null)
    }
  }, [props.open])

  const set = (field: keyof FormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (field in FIELD_LABEL) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = validate(form, options, t)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      await props.onSubmit({
        orderNo: form.orderNo.trim(),
        customerName: form.customerName.trim(),
        productCode: form.productCode,
        quantity: Number(form.quantity),
        originalDueDate: form.originalDueDate,
        targetDate: form.targetDate,
        ...(form.remark.trim() ? { remark: form.remark.trim() } : {}),
        demoFailInventoryOnce: form.demoFailInventoryOnce
      })
      props.onOpenChange(false)
    } catch (error) {
      if (error instanceof ActionError && error.code === 'DUPLICATE_ORDER') {
        setErrors({ orderNo: t('form.duplicate') })
      } else if (error instanceof ActionError && error.code === 'VALIDATION_FAILED') {
        const fields = ((error.details as { fields?: Record<string, string> } | undefined)?.fields ?? {}) as Record<string, string>
        const mapped: Partial<Record<FieldName, string>> = {}
        for (const [field, code] of Object.entries(fields)) {
          if (field in FIELD_LABEL) mapped[field as FieldName] = serverFieldMessage(field as FieldName, code, options, t)
        }
        setErrors(mapped)
        setFormError(t('error.VALIDATION_FAILED'))
      } else {
        setFormError(describeCode(t, error instanceof ActionError ? error.code : error instanceof Error ? error.message : 'unknown'))
      }
    } finally {
      setSaving(false)
    }
  }

  const field = (name: FieldName, control: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`es-${name}`}>
        {t(FIELD_LABEL[name])}
        <span className="text-destructive">*</span>
      </Label>
      {control}
      {errors[name] && (
        <p id={`es-${name}-error`} className="text-xs text-destructive">
          {errors[name]}
        </p>
      )}
    </div>
  )
  const invalid = (name: FieldName) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `es-${name}-error` : undefined
  })

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('form.title')}</DialogTitle>
            <DialogDescription>{t('form.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('orderNo', <Input id="es-orderNo" maxLength={40} value={form.orderNo} onChange={(e) => set('orderNo', e.target.value)} {...invalid('orderNo')} />)}
            {field(
              'customerName',
              <Input id="es-customerName" maxLength={80} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} {...invalid('customerName')} />
            )}
            {field(
              'productCode',
              <Select value={form.productCode} onValueChange={(value) => set('productCode', value)}>
                <SelectTrigger id="es-productCode" className="w-full" {...invalid('productCode')}>
                  <SelectValue placeholder={t('form.productPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {options.products.map((product) => (
                    <SelectItem key={product.code} value={product.code}>
                      {product.code} {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field(
              'quantity',
              <Input id="es-quantity" type="number" inputMode="numeric" min={1} step={1} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} {...invalid('quantity')} />
            )}
            {field(
              'originalDueDate',
              <Input id="es-originalDueDate" type="date" value={form.originalDueDate} onChange={(e) => set('originalDueDate', e.target.value)} {...invalid('originalDueDate')} />
            )}
            {field(
              'targetDate',
              <Input id="es-targetDate" type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} {...invalid('targetDate')} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="es-remark">{t('form.remark')}</Label>
            <Textarea id="es-remark" rows={2} maxLength={300} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="es-demoFail" checked={form.demoFailInventoryOnce} onCheckedChange={(value) => set('demoFailInventoryOnce', value === true)} />
            <Label htmlFor="es-demoFail" className="font-normal">
              {t('form.demoFail')}
            </Label>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {t('form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
