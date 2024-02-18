import bodyParser from "body-parser";
import * as chokidar from "chokidar";
import compression from "compression";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { crawl } from "./crawl/crawl";

const port = process.env.PORT ?? 3333;
const orf = process.env.ORF_API_PASSWORD;
const openai = process.env.OPENAI_KEY;

if (!orf) {
    console.error("No ORF_API_PASSWORD given");
    process.exit(-1);
}

if (!openai) {
    console.error("No OPENAI_KEY given");
    process.exit(-1);
}

let shows = (async () => {
    if (!fs.existsSync("/data")) {
        fs.mkdirSync("/data");
    }

    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/api/hello", (req, res) => {
        res.json({ message: "Hello world" });
    });

    const server = http.createServer(app);
    server.listen(port, async () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);

    const update = () => {
        crawl("/data");
        setTimeout(update, 24 * 60 * 60 * 1000);
    };
    update();
})();

function setupLiveReload(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const clients: Set<WebSocket> = new Set();
    wss.on("connection", (ws: WebSocket) => {
        clients.add(ws);
        ws.on("close", () => {
            clients.delete(ws);
        });
    });

    chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`File changed: ${path}`);
            }
        });
    });
    console.log("Initialized live-reload");
}
