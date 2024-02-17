import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { pageContainerStyle, pageContentStyle } from "../utils/styles.js";

@customElement("main-page")
export class MainPage extends LitElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="${pageContainerStyle} min-h-[100vh]">
            <div class="${pageContentStyle} h-[100vh]">
                <div class="flex-grow flex flex-col w-full mt-4 gap-4 px-4">
                    <theme-toggle class="self-end"></theme-toggle>
                    <h1 class="text-center">Austrian Media Monitor</h1>
                    <span class="text-center italic">Ein Daten-Projekt zum Monitoring von TV-Diskussions Sendungen, ihren Themen und Gästen
                </div>
                <span class="text-xs text-center text-fg-muted pb-4 mt-8 px-4"
                    >Mit Spucke und Tixo gebaut von <a href="https://twitter.com/badlogicgames" class="text-blue-400">Mario Zechner</a><br />Es werden
                    keine Daten gesammelt, nicht einmal deine IP Adresse</span
                >
            </div>
        </div>`;
    }
}
