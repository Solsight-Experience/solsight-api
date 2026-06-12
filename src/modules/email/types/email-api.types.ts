export interface SendVerificationPayload {
    toEmail: string;
    verificationUrl: string;
}

export interface SendAlertPayload {
    toEmail: string;
    subject: string;
    title: string;
    message: string;
}

export interface SendWalletAlertPayload {
    toEmail: string;
    subject: string;
    title: string;
    bodyHtml: string;
    bodyText: string;
}

export interface SendEmailPayload {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}
