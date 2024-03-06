import * as fs from "fs";
import { Person, Show } from "../common/common";

export interface PersonDetail {
    name: string;
    professions: string[];
    birthDate?: string;
    deathDate?: string;
    image?: string;
    description: string;
    wikipediaUrl: string;
}

async function getPersonDetailsWithWikipediaDescription(query: string): Promise<Array<PersonDetail>> {
    const sparqlQuery = `
    SELECT ?person ?personLabel ?professionLabel ?birthDate ?deathDate ?image ?article WHERE {
        SERVICE wikibase:mwapi {
            bd:serviceParam wikibase:endpoint "www.wikidata.org";
                            wikibase:api "EntitySearch";
                            mwapi:search "${query}";
                            mwapi:language "de".
            ?person wikibase:apiOutputItem mwapi:item.
        }
        OPTIONAL { ?person wdt:P106 ?profession. }
        OPTIONAL { ?person wdt:P569 ?birthDate. }
        OPTIONAL { ?person wdt:P570 ?deathDate. }
        OPTIONAL { ?person wdt:P18 ?image. }
        OPTIONAL { ?article schema:about ?person.
                   ?article schema:isPartOf <https://de.wikipedia.org/>. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],de". }
    } LIMIT 20
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;
    const response = await fetch(url, { headers: { Accept: "application/sparql-results+json" } });
    const data = await response.json();

    const persons = await Promise.all(
        data.results.bindings
            .filter((item: any) => item.article)
            .map(async (item: any) => {
                let description = "No description available";
                let wikipediaUrl = "";
                const pageTitle = item.article.value.split("/").pop(); // Extract the Wikipedia page title from the article URL
                const wikipediaApiUrl = `https://de.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
                wikipediaUrl = `https://de.wikipedia.org/wiki/${pageTitle}`;
                const wikipediaResponse = await fetch(wikipediaApiUrl);
                const wikipediaData = await wikipediaResponse.json();
                description = wikipediaData.extract || "Description not available";

                return {
                    name: item.personLabel.value,
                    professions: item.professionLabel ? [item.professionLabel.value] : [],
                    birthDate: item.birthDate ? item.birthDate.value : undefined,
                    deathDate: item.deathDate ? item.deathDate.value : undefined,
                    image: item.image ? item.image.value : undefined,
                    description: description,
                    wikipediaUrl,
                };
            })
    );

    return persons;
}

(async () => {
    const oldDetailsList = fs.existsSync("html/data/persons.json")
        ? (JSON.parse(fs.readFileSync("html/data/persons.json", "utf-8")) as PersonDetail[])
        : [];
    const oldDetails = new Map<string, PersonDetail>();
    for (const detail of oldDetailsList) {
        const other = oldDetails.get(detail.name);
    }

    const shows = JSON.parse(fs.readFileSync("html/data/shows.json", "utf-8")) as Show[];
    const persons = new Map<string, Person>();
    for (const show of shows) {
        for (const broadcast of show.broadcasts) {
            for (const person of broadcast.guests) {
                const other = persons.get(person.name);
                if (other) {
                    other.functions.push(...person.functions);
                } else {
                    persons.set(person.name, person);
                }
            }
        }
    }
    console.log("Unique persons: " + persons.size);
    const names = Array.from(persons.keys()).sort((a, b) => b.localeCompare(a));
    const personDetails: Record<string, PersonDetail[]> = {};
    let c = 0;
    for (const name of names) {
        if (!personDetails[name]) personDetails[name] = [];
        let queryResult = await getPersonDetailsWithWikipediaDescription(name);
        const lookup = new Map<string, PersonDetail>();
        for (const detail of queryResult) {
            const other = lookup.get(detail.wikipediaUrl);
            if (other) {
                other.professions.push(...detail.professions);
            } else {
                lookup.set(detail.wikipediaUrl, detail);
            }
        }
        const personDetail = personDetails[name];
        personDetail?.push(...Array.from(lookup.values()));
        fs.writeFileSync("html/data/persons.json", JSON.stringify(personDetails, null, 2), "utf-8");
        console.log(name + " " + ++c + "/" + persons.size);
    }
})();
