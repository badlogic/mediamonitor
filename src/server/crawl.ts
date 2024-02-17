import * as fs from "fs";
import { Broadcast, Person, Show } from "../common/common";
import { parseStringPromise } from "xml2js";

import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

function pickValue(channel: any, properties: string[], defaultValue: string = "") {
    let maxValue = defaultValue;
    for (const property of properties) {
        if (channel.hasOwnProperty(property)) {
            const value = channel[property];
            if (Array.isArray(value) && value.length > 0 && typeof value[0] == "string" && value[0].trim().length > 0) {
                const v = value[0].trim();
                if (v.length > maxValue.length) maxValue = v;
            }
            if (typeof value == "string" && value.trim().length > 0) {
                const v = value.trim();
                if (v.length > maxValue.length) maxValue = v;
            }
        }
    }
    return maxValue;
}

function getImageUrl(channel: any) {
    let imageUrl = channel.image && channel.image[0] && channel.image[0].url ? channel.image[0].url[0] : undefined;
    if (imageUrl) return;
    return channel["itunes:image"] && channel["itunes:image"][0] && channel["itunes:image"][0].$ && channel["itunes:image"][0].$.href;
}

function getBroadcast(item: any): Broadcast {
    let mediaUrl: string | undefined;
    if (item.enclosure && item.enclosure[0] && item.enclosure[0].$ && item.enclosure[0].$.type == "audio/mpeg") {
        mediaUrl = item.enclosure[0].$.url;
    }

    const broadcast: Broadcast = {
        url: pickValue(item, ["link"]),
        date: pickValue(item, ["pubDate"]),
        title: pickValue(item, ["title"]),
        description: (pickValue(item, ["itunes:subtitle"]) + "\n\n" + pickValue(item, ["description", "itunes:summary", "content:encoded"])).trim(),
        moderators: [],
        guests: [],
        mediaUrl,
        mediaType: mediaUrl ? "audio/mpeg" : undefined,
    };

    return broadcast;
}

async function extractPersons(show: Show, broadcasts: Broadcast[]) {
    try {
        broadcasts = broadcasts.filter((broadcast) => broadcast.guests.length == 0 && broadcast.moderators.length == 0);
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
                    content:
                        'You are a helpful and precise assistant. You will receive TV discussion show data formated as JSON.\n\nExtract all the moderator and guest names, as well as their titles, jobs, or functions for each show.\n\nHere is example data the user will provide to you.\n\n```\n[ {\n"title": "Konnte Andreas Babler überzeugen?",\n        "description": "Ein Jahr vor der geplanten Nationalratswahl im Herbst 2024 bittet PULS 24 die Parteichefin und -chefs in „Kolariks Luftburg“ im Prater, um mit Wählerinnen und Wählern über ihre Pläne für Österreich zu diskutieren. Konnte SPÖ-Chef Andreas Babler überzeugen? Darüber diskutieren in Pro und Contra Spezial drei hochkarätige Gäste."\n}, \n{\n"title": "Zu Gast: Glawischnig, Kdolsky und Stenzel",\n        "description": "Benkos Helfer \\n•\\tVöllig normaler Verdacht... \\n•\\tWar die Politik zu gutgläubig? \\n•\\tZahlen wir am Ende alle? \\nGesundheitssystem am Ende? \\n•\\tHaben wir eine 2-Klassen-Medizin? \\n•\\tWo sind die Ärzte und Pflegekräfte? \\n•\\tBrauchts einfach mehr Geld? \\nRasen: Auto weg! \\n•\\tAutos von Rasern werden versteigert"\n},\n{\n"title": "Talk vom 19.02.: Ein Jahr Krieg - Wann endet der europäische Alptraum?",\n        "description": "Wird die Neutralität durch die Teilnahme an den EU-Sanktionen infrage gestellt? Dürfen wir ukrainische Soldaten an Kampfpanzern ausbilden? Was sagt Selensky? Was sagt Joe Biden? Und schützt uns die Neutralität wirklich, sollte der Krieg weiter eskalieren?<br /><br />Darüber diskutiert Moderatorin Katrin Prähauser mit diesen Gästen: <ul><li>Paul Ronzheimer, stellvertretender Chefredakteur der \\"BILD\\"-Zeitung </li><li>Hajo Funke, Blogger und Politologe</li><li>Andrea Komlosy, Historikerin</li><li>Walter Feichtinger, Sicherheits-Experte und ehemaliger Brigadier</li></ul>"\n},\n{\n "title": "Talk vom 04.09.: \\"Steuermilliarden für Wien Energie: Versehen oder Versagen?\\" und \\"Wahlen im Krisenherbst: Denkzettel für die Politik?\\"",\n        "description": "Hat der unberechenbare Markt den Energiebetreiber ins Finanzdesaster getrieben? Oder stecken Missmanagement und politisches Versagen dahinter? Die Gäste bei Links. Rechts. Mitte:  <ul><li>Albert Fortell, Schauspieler - unterstützt Tassilo Wallentin in der BP-Wahl</li><li>Christoph Lütge, Wirtschaftsethiker und Kommentator</li><li>Gudula Walterskirchen, Publizistin</li><li>Barbara Toth, Journalistin „Der Falter“</li></ul>   Moderation: Katrin Prähauser",\n}\n]\n\nOutput the extracted persons for each show as follows:\n\n```\nnone,\nGlawischnig; Kdolsky; Stenzel\nKatrin Prähauser, Moderatorin; Paul Ronzheimer, stellvertretender Chefredakteur der "BILD"-Zeitung; Hajo Funke, Blogger und Politologe; Andrea Komlosy, Historikerin; Walter Feichtinger, Sicherheits-Experte und ehemaliger Brigadier\nAlbert Fortell, Schauspieler; Christoph Lütge, Wirtschaftsethiker und Kommentator; Gudula Walterskirchen, Publizistin; Barbara Toth, Journalistin „Der Falter“; Katrin Prähauser, Moderatorin\n```\n\nIMPORTANT: an empty array is emitted for shows where you could not extract any persons.\n\nIMPORTANT: Do not output anything other than the extracted persons.\n\nIMPORTANT: Do not forget to use new lines to separate the person lists.',
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
            const persons = answer.content.split("\n").filter((line) => !line.includes("```"));

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
            }
        }
    } catch (e) {
        console.error("Could not extract persons", e);
    }
}

export async function crawlPodcastRss(oldBroadcasts: Map<string, Broadcast>, url: string): Promise<Show> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        const xml = await response.text();
        const rss = await parseStringPromise(xml);
        const channel = rss.rss.channel[0];
        const show: Show = {
            url: pickValue(channel, ["link"]),
            author: pickValue(channel, ["itunes:author"]),
            title: pickValue(channel, ["title"]),
            description: pickValue(channel, ["description", "itunes:summary", "content:encoded"]).trim(),
            imageUrl: getImageUrl(channel),
            broadcasts: [],
        };

        const items = channel.item;
        for (const item of items) {
            const broadcast = getBroadcast(item);
            if (oldBroadcasts.has(broadcast.url)) {
                const oldBroadcast = oldBroadcasts.get(broadcast.url)!;
                broadcast.guests = oldBroadcast.guests;
                broadcast.moderators = oldBroadcast.moderators;
            }
            show.broadcasts.push(broadcast);
        }
        const toProcess: Broadcast[] = [...show.broadcasts];
        let processed = 0;
        while (toProcess.length > 0) {
            const batch = toProcess.splice(0, 5);
            await extractPersons(show, batch);
            processed += batch.length;
            console.log(`${show.title}: ${processed}/${show.broadcasts.length}`);
        }
        return show;
    } catch (e) {
        console.error("Could not crawl podcast RSS feed " + url, e);
        throw new Error("Could not crawl podcast RSS feed " + url);
    }
}

export async function crawl(): Promise<Show[]> {
    console.log("Starting crawl");
    const oldBroadcasts = new Map<string, Broadcast>();
    if (fs.existsSync("/data/shows.json")) {
        const oldShows = JSON.parse(fs.readFileSync("/data/shows.json", "utf-8")) as Show[];
        for (const show of oldShows) {
            for (const broadcast of show.broadcasts) {
                for (const moderator of broadcast.moderators) {
                    if (!moderator.functions) moderator.functions = [];
                    if (moderator.name.includes(",")) {
                        const parts = moderator.name.split(",");
                        moderator.name = parts.splice(0, 1)[0];
                        moderator.functions = parts;
                    }
                    delete (moderator as any).normalizedName;
                    moderator.functions = moderator.functions.map((func) => func.trim());
                }
                for (const guest of broadcast.guests) {
                    if (!guest.functions) guest.functions = [];
                    if (guest.name.includes(",")) {
                        const parts = guest.name.split(",");
                        guest.name = parts.splice(0, 1)[0];
                        guest.functions = parts;
                    }
                    delete (guest as any).normalizedName;
                    guest.functions = guest.functions.map((func) => func.trim());
                }
                oldBroadcasts.set(broadcast.url, broadcast);
            }
        }
    }

    const shows: Show[] = [];

    const podcasts = [
        // ORF
        "https://podcast.orf.at/podcast/tv/tv_zib2/tv_zib2.xml", // ZIB 2
        "https://podcast.orf.at/podcast/tv/tv_pressestunde/tv_pressestunde.xml", // Pressestunde
        "https://podcast.orf.at/podcast/tv/tv_reportinterviews/tv_reportinterviews.xml", // Report Interviews
        // Servus TV
        "https://www.spreaker.com/show/5965125/episodes/feed", // Talk im Hangar 7
        "https://www.spreaker.com/show/5965147/episodes/feed", // Links. Rechts. Mitte - Duell der Meinungsmacher
        // PULS24
        "https://wildumstritten.podigee.io/feed/mp3", // Wild umstritten
        "https://pro-und-contra.podigee.io/feed/mp3", // Pro & Contra
        "https://milborn.podigee.io/feed/mp3", // Milborn
    ];

    for (const podcast of podcasts) {
        shows.push(await crawlPodcastRss(oldBroadcasts, podcast));
        fs.writeFileSync("/data/shows.json", JSON.stringify(shows, null, 2));
    }

    console.log("Crawl complete");
    return shows;
}
