export interface HolderCommand {
    action: "track" | "untrack" | "list";
    mint?: string;
    bootstrap?: boolean;
}

export interface TrackedMintState {
    subscriberCount: number;
    untrackTimer?: NodeJS.Timeout;
    isTracked: boolean;
}
