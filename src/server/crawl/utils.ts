import { Show, Broadcast } from "../../common/common";
import OpenAI from "openai";
// @ts-ignore
import extractPersonsPrompt from "./extract-persons-prompt.txt";
// @ts-ignore
import extractPersonsPrompt2 from "./extract-persons-prompt-2.txt";

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
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: extractPersonsPrompt2,
                },
                {
                    role: "user",
                    content: data,
                },
            ],
            temperature: 0,
            max_tokens: 2048,
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
                    if (person.includes("Moderator") || person.includes("politikchefredakteurin")) {
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

export async function getWikidataPerson(query: string): Promise<Array<{ name: string; professions: string[]; birthDate?: string; image?: string }>> {
    // Search for items via the first Wikidata API endpoint
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=20&search=${encodeURIComponent(
        query
    )}&origin=*`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    const persons: Array<{ name: string; professions: string[]; birthDate?: string; image?: string }> = [];

    for (const item of searchData.search) {
        // Fetch the details with the second Wikidata API endpoint
        const detailsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${item.id}&format=json&props=claims&origin=*`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        const claims = detailsData.entities[item.id].claims;

        // Check if the item is a person (P31: Q5)
        const isPerson = claims.P31 && claims.P31.some((claim: any) => claim.mainsnak.datavalue.value.id === "Q5");
        if (!isPerson) continue;

        // Extract name, professions, birth date, and image if available
        const name = item.label;
        const professions = claims.P106 ? claims.P106.map((claim: any) => claim.mainsnak.datavalue.value.id) : [];
        const birthDate = claims.P569 ? claims.P569[0].mainsnak.datavalue.value.time : undefined;
        const image = claims.P18
            ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(claims.P18[0].mainsnak.datavalue.value)}`
            : undefined;

        persons.push({ name, professions, birthDate, image });
    }

    return persons;
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
