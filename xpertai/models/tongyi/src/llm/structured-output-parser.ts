import { isAIMessage } from '@langchain/core/messages'
import { OutputParserException } from '@langchain/core/output_parsers'
import { JsonOutputKeyToolsParser, type JsonOutputKeyToolsParserParamsInterop } from '@langchain/core/output_parsers/openai_tools'
import { Validator } from '@langchain/core/utils/json_schema'

// Auto tool selection may return prose or a different tool; neither is a valid structured result.
export class TongyiStructuredOutputParser<T extends object> extends JsonOutputKeyToolsParser<T> {
  private readonly validator: Validator

  constructor(fields: JsonOutputKeyToolsParserParamsInterop<T>, schema: object) {
    super(fields)
    this.validator = new Validator(schema)
  }

  override async parseResult(...args: Parameters<JsonOutputKeyToolsParser<T>['parseResult']>): Promise<T> {
    const message = args[0][0]?.message
    if (!message || !isAIMessage(message) || message.invalid_tool_calls?.length ||
      message.tool_calls?.length !== 1 || message.tool_calls[0].name !== this.keyName) {
      throw new OutputParserException(`Expected exactly one ${this.keyName} tool call for structured output`)
    }
    if (!this.validator.validate(message.tool_calls[0].args).valid) {
      throw new OutputParserException(`The ${this.keyName} tool arguments do not match the structured output schema`)
    }
    return super.parseResult(...args)
  }
}
