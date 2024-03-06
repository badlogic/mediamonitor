export interface Batch<T> {
    items: T[];
    score: number;
}

export function batch<T>(items: T[], score: (item: T) => number, maxScore: number) {
    const batches: Batch<T>[] = [];
    const toProcess = [...items];
    while (true) {
        const batch: Batch<T> = {
            items: [],
            score: 0,
        };
        while (toProcess.length > 0) {
            const item = toProcess[toProcess.length - 1];
            const itemScore = score(item);
            if (batch.score + itemScore > maxScore) break;
            batch.items.push(item);
            batch.score += itemScore;
            toProcess.pop();
        }
        if (batch.items.length == 0) break;
        batches.push(batch);
    }
    return batches;
}
