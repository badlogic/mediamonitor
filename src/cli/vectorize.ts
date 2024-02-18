import * as fs from "fs";
import { Show, Broadcast } from "../common/common";

(async () => {
    const shows = JSON.parse(fs.readFileSync("html/data/shows.json", "utf-8")) as Show[];
    while (shows.length > 0) {
        const show = shows.pop()!;
        console.log(`>>> ${show.title} - ${show.author}`);
        const toProcess: Broadcast[] = [...show.broadcasts];
        do {
            const batch = toProcess.splice(0, 20);
            // const embedUrl = "https://jinaembedder.marioslab.io/embed";
            const embedUrl = "http://localhost:5000/embed";
            const response = await fetch(embedUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch.map((broadcast) => broadcast.title + "\n" + broadcast.description)),
            });
            if (!response.ok) {
                console.log("Could not vectorize documents: " + (await response.text()));
            } else {
                const embeddings = response.json();
            }
            console.log(`Processed ${show.broadcasts.length - toProcess.length}/${show.broadcasts.length}`);
        } while (toProcess.length > 0);
    }
})();
