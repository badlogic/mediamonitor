export interface Person {
    name: string;
    functions: string[];
    wikipediaUrl?: string;
}

export interface Broadcast {
    url: string;
    date: string; // ISO 8601
    title: string;
    description: string;
    moderators: Person[];
    guests: Person[];
    mediaUrl?: string;
    mediaType?: string;
}

export interface Show {
    url: string;
    author: string;
    title: string;
    description: string;
    imageUrl?: string;
    broadcasts: Broadcast[];
}
