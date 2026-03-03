import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatDingTalkMessage } from '../../../message.js'
import { DispatchDingTalkChatCommand } from '../dispatch-dingtalk-chat.command.js'
import { DingTalkChatDispatchService } from '../../dingtalk-chat-dispatch.service.js'

@CommandHandler(DispatchDingTalkChatCommand)
export class DispatchDingTalkChatCommandHandler
	implements ICommandHandler<DispatchDingTalkChatCommand, ChatDingTalkMessage>
{
	constructor(private readonly dispatchService: DingTalkChatDispatchService) {}

	async execute(command: DispatchDingTalkChatCommand): Promise<ChatDingTalkMessage> {
		return this.dispatchService.enqueueDispatch(command.input)
	}
}
