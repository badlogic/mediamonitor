import OpenAI from "openai";
import { tokenize } from "./llm";
import { batch } from "./batch";

export interface Embedder {
    embed(texts: string[]): Promise<number[][]>;
}

export type OpenAIEmbedderModels = "text-embedding-3-small";

export class OpenAIEmbedder implements Embedder {
    static readonly MAX_TOKENS = 8000; // Some slack
    readonly client: OpenAI;

    constructor(public readonly apiKey: string, public readonly model: OpenAIEmbedderModels, public readonly baseURL?: string) {
        this.client = new OpenAI({
            apiKey,
            baseURL,
        });
    }

    async embed(texts: string[]): Promise<number[][]> {
        const batches = batch(texts, (text) => tokenize(text, "gpt-3.5-turbo").length, OpenAIEmbedder.MAX_TOKENS);
        const embeddings: number[][] = [];
        for (const batch of batches) {
            const response = await this.client.embeddings.create({
                input: batch.items,
                model: this.model,
                encoding_format: "float",
            });
            embeddings.push(...response.data.map((embedding) => embedding.embedding));
        }
        return embeddings;
    }
}

export function norm(a: number[]) {
    let sum = 0;
    for (const v of a) {
        sum += v * v;
    }
    return Math.sqrt(sum);
}

export function cosineSimilarity(a: number[], b: number[]) {
    if (a.length != b.length) throw new Error("a.length != b.length");
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot / (norm(a) * norm(b));
}
