import OpenAI from "openai";
import { getEncoding } from "js-tiktoken";
import { assertNever } from "../utils/utils";
import { sum } from "./data";

export type LlmModel = "gpt-3.5-turbo" | "gpt-4-turbo-preview";

export interface LlmMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export function truncateMessages(messages: LlmMessage[], model: LlmModel, maxTokens: number) {
    const totalTokens = sum(messages, (message) => tokenize(message.content, model).length);
    if (totalTokens < maxTokens) {
        return messages;
    }

    const truncatedMessages: LlmMessage[] = [messages[0]];
    let remainingTokens = maxTokens - tokenize(truncatedMessages[0].content, model).length;
    const toProcess = [...messages];
    toProcess.splice(0, 1);
    toProcess.reverse();
    const toAppend: LlmMessage[] = [];
    for (const message of toProcess) {
        const tokens = tokenize(message.content, model).length;
        if (remainingTokens >= tokens) {
            toAppend.push(message);
            remainingTokens -= tokens;
        } else {
            break;
        }
    }
    truncatedMessages.push(...toAppend.reverse());
    return truncatedMessages;
}

export function formatMessages(messages: LlmMessage[]) {
    return messages.map((message) => `<${message.role}>\n${message.content}`).join("\n\n");
}

const maxTokens: Record<LlmModel, number> = {
    "gpt-3.5-turbo": 15000,
    "gpt-4-turbo-preview": 15000,
};

export class Llm {
    client: OpenAI;
    messages: LlmMessage[] = [];
    temperature = 0;
    log = (token: string) => {};

    constructor(public readonly apiKey: string, public model: LlmModel, public readonly baseURL?: string) {
        this.client = new OpenAI({
            apiKey,
            baseURL,
        });
    }

    async complete(prompt: string, maxResponseTokens = 2048, responseCallback = (token: string) => {}) {
        this.messages.push({ role: "user", content: prompt.trim() });
        const truncatedMessages = truncateMessages(this.messages, this.model, maxTokens[this.model]);
        const stream = await this.client.chat.completions.create({
            messages: truncatedMessages,
            model: this.model,
            temperature: this.temperature,
            stream: true,
        });
        let reply = "";
        for await (const completion of stream) {
            const token = completion.choices[0].delta.content;
            if (token == undefined) {
                break;
            }
            reply += token;
            responseCallback(token);
            this.log(token);
        }
        this.messages.push({ role: "assistant", content: reply });
        const totalTokens = sum(this.messages, (message) => tokenize(message.content, this.model).length);
        this.log("\n\nTokens: " + totalTokens + "\n");
        return reply;
    }

    clearHistory() {
        this.messages = [];
    }

    toString() {
        return `model: ${this.model}\nbaseUrl: ${this.baseURL}\bmessages: ${formatMessages(this.messages)}`;
    }

    systemPrompt(prompt: string) {
        const message: LlmMessage = {
            role: "system",
            content: prompt.trim(),
        };
        if (this.messages.length == 0) {
            this.messages.push(message);
        } else {
            this.messages[0] = message;
        }
    }
}

const gptTokenizer = getEncoding("cl100k_base");

export function tokenize(text: string, model: LlmModel) {
    switch (model) {
        case "gpt-3.5-turbo":
        case "gpt-4-turbo-preview":
            return gptTokenizer.encode(text, "all");
        default:
            assertNever(model);
            throw new Error(`Tokenization for model '${model}' not implemented`);
    }
}
