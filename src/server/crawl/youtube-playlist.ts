import { YoutubeTranscript } from "youtube-transcript";
import * as ytpl from "ytpl";
import { Broadcast, Person, Show } from "../../common/common";
import { resuseOldBroadcast } from "./utils";

export async function crawlYoutubePlaylist(oldBroadcasts: Map<string, { show: Show; broadcast: Broadcast }>, playlistId: string) {
    try {
        // Fetch playlist information
        const playlist = await ytpl.default(playlistId);
        const show: Show = {
            author: playlist.author.name,
            description: playlist.description ?? "",
            title: playlist.title,
            url: playlist.url,
            imageUrl: playlist.bestThumbnail.url ?? undefined,
            broadcasts: [],
        };

        for (const video of playlist.items) {
            const oldBroadcast = resuseOldBroadcast(oldBroadcasts, video.url);
            if (oldBroadcast) {
                show.broadcasts.push(oldBroadcast);
                continue;
            }

            let description = "";
            try {
                const transcript = await YoutubeTranscript.fetchTranscript(video.id);
                description = transcript
                    .map((entry) => entry.text)
                    .join(" ")
                    .slice(0, 500);
            } catch (error) {
                // Ignore
            }

            const broadcast: Broadcast = {
                url: video.url,
                date: "", // FIXME
                title: video.title,
                description,
                moderators: [],
                guests: [],
                mediaUrl: video.url,
            };
            show.broadcasts.push(broadcast);
        }
        return show;
    } catch (error) {
        console.error("Failed to fetch playlist details:", error);
    }
}
