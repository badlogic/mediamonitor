import { Show, Broadcast } from "../../common/common";
import OpenAI from "openai";
// @ts-ignore
import extractPersonsPrompt from "./extract-persons-prompt.txt";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

export async function extractPersons(show: Show, broadcasts: Broadcast[]) {
    try {
        if (broadcasts.length == 0) return;
        const data = JSON.stringify(
            broadcasts.map((broadcast) => {
                return { title: broadcast.title, description: broadcast.description };
            }),
            null,
            2
        );
        const response = await openai.chat.completions.create({
            // model: "gpt-3.5-turbo-0125",
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: extractPersonsPrompt,
                },
                {
                    role: "user",
                    content: data,
                },
            ],
            temperature: 0,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        const answer = response.choices[0].message;
        if (answer.content) {
            const persons = answer.content
                .split("\n")
                .map((line) => line.replace("```", "").trim())
                .filter((line) => line.length > 0);

            if (broadcasts.length != persons.length) {
                throw new Error(`broadcasts.length != persons.length\n${data}\n${persons}`);
            }
            for (let i = 0; i < broadcasts.length; i++) {
                const broadcast = broadcasts[i];
                if (persons[i] == "none") {
                    continue;
                }
                for (const person of persons[i].split(";")) {
                    if (person.includes("Moderator")) {
                        broadcast.moderators.push({
                            name: person.trim(),
                            functions: [],
                        });
                    } else {
                        broadcast.guests.push({
                            name: person.trim(),
                            functions: [],
                        });
                    }
                }
                for (const moderator of broadcast.moderators) {
                    if (!moderator.functions) moderator.functions = [];
                    if (moderator.name.includes(",")) {
                        const parts = moderator.name.split(",");
                        moderator.name = parts.splice(0, 1)[0];
                        moderator.functions = parts;
                    }
                    moderator.functions = moderator.functions.map((func) => func.trim());
                }
                for (const guest of broadcast.guests) {
                    if (!guest.functions) guest.functions = [];
                    if (guest.name.includes(",")) {
                        const parts = guest.name.split(",");
                        guest.name = parts.splice(0, 1)[0];
                        guest.functions = parts;
                    }
                    guest.functions = guest.functions.map((func) => func.trim());
                }
            }
        }
    } catch (e) {
        console.error("Could not extract persons", e);
    }
}

export function resuseOldBroadcast(oldBroadcasts: Map<string, { show: Show; broadcast: Broadcast }>, broadcastUrl: string): Broadcast | undefined {
    if (oldBroadcasts.has(broadcastUrl)) {
        const oldBroadcast = oldBroadcasts.get(broadcastUrl)!;
        oldBroadcasts.delete(broadcastUrl);
        oldBroadcast.show.broadcasts = oldBroadcast.show.broadcasts.filter((other) => other.url != oldBroadcast.broadcast.url);
        return oldBroadcast.broadcast;
    }

    return undefined;
}
