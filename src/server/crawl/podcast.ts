import { Broadcast, Show } from "../../common/common";
import { parseStringPromise } from "xml2js";
import { resuseOldBroadcast } from "./utils";

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
    if (imageUrl) return imageUrl;
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

export async function crawlPodcastRss(oldBroadcasts: Map<string, { show: Show; broadcast: Broadcast }>, url: string): Promise<Show> {
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
            const oldBroadcast = resuseOldBroadcast(oldBroadcasts, broadcast.url);
            show.broadcasts.push(oldBroadcast ?? broadcast);
        }
        return show;
    } catch (e) {
        console.error("Could not crawl podcast RSS feed " + url, e);
        throw new Error("Could not crawl podcast RSS feed " + url);
    }
}
