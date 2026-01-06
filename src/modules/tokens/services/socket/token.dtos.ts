export interface TokenSubscribeDto {
  domain: string;
  resource: string;
  interval: string;
}

export interface TokenUnsubscribeDto {
  domain: string;
  resource: string;
  interval: string;
}
