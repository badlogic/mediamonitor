import { YoutubeTranscript } from "youtube-transcript";
import * as ytpl from "ytpl";
import { Broadcast, Person, Show } from "../../common/common";
import { resuseOldBroadcast } from "./utils";

import { google } from "googleapis";

const youtube = google.youtube("v3");
console.log(">>> YOUTUBE_KEY: " + process.env.YOUTUBE_KEY);
google.options({ auth: process.env.YOUTUBE_KEY });

interface VideoInfo {
    title: string;
    publicationDate: string;
    description: string;
    url: string;
}

export async function getYouTubePlaylist(oldBroadcasts: Map<string, { show: Show; broadcast: Broadcast }>, playlistId: string): Promise<Show> {
    const videos: VideoInfo[] = [];

    async function getPlaylistItems(pageToken: string = "") {
        return await youtube.playlistItems.list({
            part: ["snippet"],
            playlistId: playlistId,
            maxResults: 50,
            pageToken: pageToken,
        });
    }

    const playlist = (
        await youtube.playlists.list({
            part: ["snippet"],
            id: [playlistId],
        })
    ).data.items![0];

    let response = await getPlaylistItems();
    while (true) {
        if (!response.data.items) break;
        response.data.items.forEach((video) => {
            const url = "https://www.youtube.com/watch?v=" + video.snippet?.resourceId?.videoId;
            videos.push({
                title: video.snippet?.title!,
                publicationDate: video.snippet?.publishedAt!,
                description: video.snippet?.description!,
                url,
            });
        });

        if (response.data.nextPageToken) {
            response = await getPlaylistItems(response.data.nextPageToken);
        } else {
            break;
        }
    }

    const show: Show = {
        author: playlist.snippet?.channelTitle ?? "",
        broadcasts: videos.map((video) => {
            if (oldBroadcasts.has(video.url)) return oldBroadcasts.get(video.url)!.broadcast;
            return {
                url: video.url,
                date: video.publicationDate,
                title: video.title,
                description: video.description,
                moderators: [],
                guests: [],
                mediaUrl: video.url,
                mediaType: "application/youtube",
            };
        }),
        description: playlist.snippet?.description ?? "",
        title: playlist.snippet?.title ?? "",
        imageUrl: playlist.snippet?.thumbnails?.default?.url ?? "",
        url: "https://www.youtube.com/playlist?list=" + playlistId,
    };

    return show;
}

export async function crawlYoutubePlaylist(
    oldBroadcasts: Map<string, { show: Show; broadcast: Broadcast }>,
    playlistId: string,
    useTranscript = false,
    maxVideos = 100
) {
    try {
        // Fetch playlist information
        const show = await getYouTubePlaylist(oldBroadcasts, playlistId);
        show.broadcasts = show.broadcasts.splice(0, maxVideos);

        if (useTranscript) {
            for (const video of show.broadcasts) {
                const oldBroadcast = resuseOldBroadcast(oldBroadcasts, video.url);
                if (oldBroadcast && !useTranscript) continue;
                try {
                    const videoId = video.url.split("=")[1];
                    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
                    video.description = transcript
                        .map((entry) => entry.text)
                        .join(" ")
                        .slice(0, 500);
                } catch (error) {
                    console.log(error);
                }
            }
        }
        return show;
    } catch (error) {
        console.error("Failed to fetch playlist details:", error);
        return undefined;
    }
}
