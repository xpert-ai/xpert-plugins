import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../../message.js'
import { DispatchLarkChatCommand } from '../dispatch-lark-chat.command.js'
import { LarkChatDispatchService } from '../../lark-chat-dispatch.service.js'

@CommandHandler(DispatchLarkChatCommand)
export class DispatchLarkChatCommandHandler
	implements ICommandHandler<DispatchLarkChatCommand, ChatLarkMessage>
{
	constructor(private readonly dispatchService: LarkChatDispatchService) {}

	async execute(command: DispatchLarkChatCommand): Promise<ChatLarkMessage> {
		return this.dispatchService.enqueueDispatch(command.input)
	}
}
