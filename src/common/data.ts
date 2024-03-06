export function zip<T, V, N extends string>(items: T[], column: V[], name: N): (T & { [P in N]: V })[] {
    if (items.length != column.length) throw new Error("items.length != column.length");
    items.forEach((item, index) => ((item as any)[name] = column[index]));
    return items as (T & { [P in N]: V })[];
}

export function unzip<T, N extends keyof T>(items: T[], name: N): T[N][] {
    return items.map((item) => item[name]);
}

export function sum<T>(items: T[], score: (item: T) => number) {
    let s = 0;
    for (const item of items) {
        s += score(item);
    }
    return s;
}
