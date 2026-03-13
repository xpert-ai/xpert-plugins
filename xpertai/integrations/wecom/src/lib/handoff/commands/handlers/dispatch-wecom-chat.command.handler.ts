import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatWeComMessage } from '../../../message.js'
import { DispatchWeComChatCommand } from '../dispatch-wecom-chat.command.js'
import { WeComChatDispatchService } from '../../wecom-chat-dispatch.service.js'

@CommandHandler(DispatchWeComChatCommand)
export class DispatchWeComChatCommandHandler
  implements ICommandHandler<DispatchWeComChatCommand, ChatWeComMessage>
{
  constructor(private readonly dispatchService: WeComChatDispatchService) {}

  async execute(command: DispatchWeComChatCommand): Promise<ChatWeComMessage> {
    return this.dispatchService.enqueueDispatch(command.input)
  }
}
