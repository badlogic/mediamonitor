import * as fs from "fs";
import { Broadcast, Show } from "../../common/common";
import { crawlYoutubePlaylist } from "./youtube-playlist";
import { crawlPodcastRss } from "./podcast";
import { extractPersons } from "./utils";
import writeXlsxFile from "write-excel-file/node";

function printStats(shows: Show[]) {
    console.log(">>> Statistics");
    console.log("Shows: " + shows.length);
    for (const show of shows) {
        console.log("Show " + show.title + " - " + show.author);
        console.log("   broadcasts: " + show.broadcasts.length);
        console.log(
            "   broadcasts without persons: " +
                show.broadcasts.filter((broadcast) => broadcast.guests.length == 0 && broadcast.moderators.length == 0).length
        );
        console.log("   persons: " + show.broadcasts.reduce((acc, b) => acc + b.moderators.length + b.guests.length, 0));
        console.log(
            "   persons without functions: " +
                show.broadcasts.reduce((acc, b) => acc + [...b.moderators, ...b.guests].filter((p) => p.functions.length >>> 0).length, 0)
        );
    }
}

export async function crawl(baseDir: string): Promise<Show[]> {
    console.log("Starting crawl");

    // Read in old shows and their broadcasts. We keep full history.
    const oldBroadcasts = new Map<string, { show: Show; broadcast: Broadcast }>();
    let oldShows = new Map<string, Show>();
    if (fs.existsSync(`${baseDir}/shows.json`)) {
        const oldShowsList = JSON.parse(fs.readFileSync(`${baseDir}/shows.json`, "utf-8")) as Show[];
        for (const show of oldShowsList) {
            if (show.url == "https://www.youtube.com/playlist?list=PL_lFyO5-FNuENyxEp9LhMuHQJrtauxyGs") continue;
            oldShows.set(show.url, show);
            for (const broadcast of show.broadcasts) {
                oldBroadcasts.set(broadcast.url, { show: show, broadcast });
            }
        }
    }

    const shows: Show[] = [];

    // YouTube Playlists
    const youtubePlaylists: { id: string; useTranscript: boolean; maxVideos: number }[] = [
        // { id: "PLgLaRsInxwnad9EE8NmTNvdXY4VYudh0n", useTranscript: false, maxVideos: 100 }, // Fellner Live & Isabella Daniel
        { id: "PL_lFyO5-FNuGOTpDhbKB7KwarkUCr4N9k", useTranscript: false, maxVideos: 100 }, // KroneTV Club 3
        // { id: "PL_lFyO5-FNuENyxEp9LhMuHQJrtauxyGs", useTranscript: false, maxVideos: 100 }, // KroneTV Das Duell
        { id: "PL5JhRvxqnuIoxukO8iOJGcXWtRV6plTHk", useTranscript: false, maxVideos: 100 }, // KurierTV Checkpoint
        { id: "PL_lFyO5-FNuHwI4GJfVQdaJyglD0eb5V8", useTranscript: false, maxVideos: 100 }, // KroneTV Rainer Nowak - der Talk
    ];
    for (const playlist of youtubePlaylists) {
        console.log(">>> Extracting YouTube playlist " + playlist.id);
        const show = await crawlYoutubePlaylist(oldBroadcasts, playlist.id, playlist.useTranscript, playlist.maxVideos);
        if (show) {
            shows.push(show);
            fs.writeFileSync(`${baseDir}/shows-new.json`, JSON.stringify(shows, null, 2));
        }
    }

    // Podcast RSS feeds
    const podcasts = [
        // ORF
        "https://podcast.orf.at/podcast/tv/tv_zib2/tv_zib2.xml", // ZIB 2
        "https://podcast.orf.at/podcast/tv/tv_pressestunde/tv_pressestunde.xml", // Pressestunde
        "https://podcast.orf.at/podcast/tv/tv_reportinterviews/tv_reportinterviews.xml", // Report Interviews
        "https://podcast.orf.at/podcast/oe1/oe1_imjournalzugast/oe1_imjournalzugast.xml", // Im Ö1 Journal zu Gast
        // Servus TV
        "https://www.spreaker.com/show/5965125/episodes/feed", // Talk im Hangar 7
        "https://www.spreaker.com/show/5965147/episodes/feed", // Links. Rechts. Mitte - Duell der Meinungsmacher
        // PULS24
        "https://wildumstritten.podigee.io/feed/mp3", // Wild umstritten
        "https://pro-und-contra.podigee.io/feed/mp3", // Pro & Contra
        "https://milborn.podigee.io/feed/mp3", // Milborn
        // ATV
        "https://atvdertalk.podigee.io/feed/mp3", // ATV Aktuell - Der Talk
        "https://atv-aktuell-die-woche.podigee.io/feed/mp3", // ATV Aktuell - Die Woche
    ];

    for (const podcast of podcasts) {
        console.log(">>> Extracting podcast " + podcast);
        const show = await crawlPodcastRss(oldBroadcasts, podcast);
        if (show) {
            shows.push(show);
            fs.writeFileSync(`${baseDir}/shows-new.json`, JSON.stringify(shows, null, 2));
        }
    }

    // Merge old shows/broadcasts into new data so we don't lose history
    console.log(">>> Merging old shows and broadcasts");
    for (const show of shows) {
        if (oldShows.has(show.url)) {
            const oldBroadcasts = oldShows.get(show.url)!.broadcasts;
            const newBroadcasts = new Set<string>(show.broadcasts.map((broadcast) => broadcast.url));
            show.broadcasts.push(...oldBroadcasts.filter((broadcast) => !newBroadcasts.has(broadcast.url)));
            oldShows.delete(show.url);
        }
        show.broadcasts.sort((a, b) => b.date.localeCompare(a.date));
    }
    shows.push(...oldShows.values());

    // Limit to broadcasts >= 2024
    for (const show of shows) {
        show.broadcasts = show.broadcasts
            .filter((broadcast) => new Date(broadcast.date).getFullYear() >= 2024)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // Extract guests and moderators
    console.log(">>> Extracting guests and moderators");
    for (const show of shows) {
        const toProcess: Broadcast[] = [...show.broadcasts];
        let processed = 0;
        while (toProcess.length > 0) {
            const batch = toProcess.splice(0, 5);
            await extractPersons(
                show,
                batch.filter((broadcast) => broadcast.guests.length == 0 && broadcast.moderators.length == 0)
            );
            processed += batch.length;
            console.log(`${show.title}: ${processed}/${show.broadcasts.length}`);
            fs.writeFileSync(`${baseDir}/shows-new.json`, JSON.stringify(shows, null, 2));
        }
    }

    fs.writeFileSync(`${baseDir}/shows.json`, JSON.stringify(shows, null, 2));
    printStats(shows);
    console.log("Crawl complete");

    // Export to Excel
    await exportExcel(baseDir, shows);
    return shows;
}

async function exportExcel(baseDir: string, shows: Show[]) {
    const header = [
        {
            value: "showAuthor",
            fontWeight: "bold",
        },
        {
            value: "showTitle",
            fontWeight: "bold",
        },
        {
            value: "showUrl",
            fontWeight: "bold",
        },
        {
            value: "bcTitle",
            fontWeight: "bold",
        },
        {
            value: "bcDate",
            fontWeight: "bold",
        },
        {
            value: "bcDescription",
            fontWeight: "bold",
        },
        {
            value: "bcUrl",
            fontWeight: "bold",
        },
        {
            value: "personName",
            fontWeight: "bold",
        },
        {
            value: "personFunction",
            fontWeight: "bold",
        },
        {
            value: "isGuest",
            fontWeight: "bold",
        },
    ];

    const rows = [];
    rows.push(header);
    for (const show of shows) {
        for (const broadcast of show.broadcasts) {
            for (const person of broadcast.moderators) {
                rows.push([
                    { value: show.author },
                    { value: show.title },
                    { value: show.url },
                    { value: broadcast.title },
                    { value: new Date(broadcast.date), format: "yyyy/mm/dd" },
                    { value: broadcast.description },
                    { value: broadcast.url },
                    { value: person.name },
                    { value: "Moderator:in" },
                    { value: false },
                ]);
            }
            for (const person of broadcast.guests) {
                rows.push([
                    { value: show.author },
                    { value: show.title },
                    { value: show.url },
                    { value: broadcast.title },
                    { value: new Date(broadcast.date), format: "yyyy/mm/dd" },
                    { value: broadcast.description },
                    { value: broadcast.url },
                    { value: person.name },
                    { value: person.functions.join(", ") },
                    { value: true },
                ]);
            }
        }
    }
    await writeXlsxFile(rows as any, { filePath: baseDir + "/persons.xlsx", stickyRowsCount: 1 });
}
