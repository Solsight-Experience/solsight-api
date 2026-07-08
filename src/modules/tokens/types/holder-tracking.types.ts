export interface HolderCommand {
    action: "track" | "untrack";
    mint?: string;
}

export interface TrackedMintState {
    subscriberCount: number;
    untrackTimer?: NodeJS.Timeout;
    isTracked: boolean;
}
