import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from "@xpert-ai/plugin-sdk";
import { ConfigModule } from '@nestjs/config'
import chalk from 'chalk'
import { TongyiProviderStrategy } from "./provider.strategy.js";
import { TongyiLargeLanguageModel } from "./llm/llm.js";
import { TongyiTextEmbeddingModel } from "./text-embedding/text-embedding.js";
import { TongyiTTSModel } from "./tts/tts.js";
import { TongyiSpeech2TextModel } from "./speech2text/speech2text.js";
import { TongyiRerankModel } from "./rerank/index.js";

@XpertServerPlugin({
	imports: [ConfigModule],
	providers: [TongyiProviderStrategy,
        TongyiLargeLanguageModel,
        TongyiTextEmbeddingModel,
        TongyiTTSModel,
        TongyiSpeech2TextModel,
        TongyiRerankModel
    ]
})
export class TongyiModule implements IOnPluginBootstrap, IOnPluginDestroy {
	private logEnabled = true;

	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${TongyiModule.name} is being bootstrapped...`));
		}
	}
    onPluginDestroy(): void | Promise<void> {
        if (this.logEnabled) {
            console.log(chalk.green(`${TongyiModule.name} is being destroyed...`));
        }
    }
}