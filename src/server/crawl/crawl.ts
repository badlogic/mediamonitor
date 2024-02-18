import * as fs from "fs";
import { Broadcast, Show } from "../../common/common";
import { crawlYoutubePlaylist } from "./youtube-playlist";
import { crawlPodcastRss } from "./podcast";
import { extractPersons } from "./utils";

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
            oldShows.set(show.url, show);
            for (const broadcast of show.broadcasts) {
                oldBroadcasts.set(broadcast.url, { show: show, broadcast });
            }
        }
    }

    const shows: Show[] = [];

    // YouTube Playlists
    const youtubePlaylists: string[] = [
        "PLgLaRsInxwnad9EE8NmTNvdXY4VYudh0n", // Fellner Live & Isabella Daniel
    ];
    for (const playlist of youtubePlaylists) {
        console.log(">>> Extracting YouTube playlist " + playlist);
        const show = await crawlYoutubePlaylist(oldBroadcasts, playlist);
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
        // Servus TV
        "https://www.spreaker.com/show/5965125/episodes/feed", // Talk im Hangar 7
        "https://www.spreaker.com/show/5965147/episodes/feed", // Links. Rechts. Mitte - Duell der Meinungsmacher
        // PULS24
        "https://wildumstritten.podigee.io/feed/mp3", // Wild umstritten
        "https://pro-und-contra.podigee.io/feed/mp3", // Pro & Contra
        "https://milborn.podigee.io/feed/mp3", // Milborn
    ];

    for (const podcast of podcasts) {
        console.log(">>> Extracting podcast " + podcast);
        shows.push(await crawlPodcastRss(oldBroadcasts, podcast));
        fs.writeFileSync(`${baseDir}/shows-new.json`, JSON.stringify(shows, null, 2));
    }

    // Merge old shows/broadcasts into new data so we don't lose history
    console.log(">>> Merging old shows and broadcasts");
    for (const show of shows) {
        if (oldShows.has(show.url)) {
            show.broadcasts.push(...oldShows.get(show.url)!.broadcasts);
            oldShows.delete(show.url);
        }
    }
    shows.push(...oldShows.values());

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
        }
    }

    fs.writeFileSync(`${baseDir}/shows.json`, JSON.stringify(shows, null, 2));
    printStats(shows);
    console.log("Crawl complete");
    return shows;
}
