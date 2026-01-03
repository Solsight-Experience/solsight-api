export const ROOM_RULES = {
  price: ['5s'],
  chart: ['10s', '1m', '5m'],
  tx: ['5s'],
  stats: ['5s'],
  trades: ['5s'],
  top_traders: ['5s'],
  holders: ['5s'],
  volume: ['5s'],
} as const;

export type RoomDomain = keyof typeof ROOM_RULES;
export type RoomInterval = (typeof ROOM_RULES)[RoomDomain][number];
export const parseRoomIntervalMs = (interval: RoomInterval): number => {
  const value = Number.parseInt(interval, 10);
  const unit = interval.slice(-1);

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return value * 1000;
  }
};
