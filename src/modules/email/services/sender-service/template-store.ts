export type TemplateArg = string | number | boolean | null;

export interface BuiltTemplate<T extends TemplateArg[]> {
    args: T;
    renderHtml: () => string;
    renderText: () => string;
}

function interpolate(template: string, args: TemplateArg[]): string {
    return template.replace(/\{(\d+)\}/g, (_, index) => {
        const i = Number(index);
        return args[i] !== undefined ? String(args[i]) : "";
    });
}

function defineTemplate<T extends TemplateArg[]>(html: string, text: string) {
    return (args: [...T]): BuiltTemplate<T> => ({
        args,
        renderHtml: () => interpolate(html, args),
        renderText: () => interpolate(text, args)
    });
}

export const Templates = {
    VERIFICATION: defineTemplate<[verificationUrl: string]>(
        `
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0c1018;color:#e2e8f0;border-radius:12px">
                        <h2 style="margin:0 0 12px;font-size:18px;color:#ffffff">Verify your email</h2>
                        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
                            Click the button below to verify your email and start receiving SolSight wallet alert notifications.
                        </p>
                        <a href="{0}"
                           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#ffffff;
                                  text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
                            Verify Email
                        </a>
                        <p style="margin:24px 0 0;font-size:12px;color:#475569">
                            This link expires in 24 hours. If you didn't request this, ignore this email.
                        </p>
                    </div>
`,
        `Verify your email for SolSight alerts\n\nClick the link below to verify your email and start receiving SolSight wallet alert notifications.\n\n{0}\n\nThis link expires in 24 hours. If you didn't request this, ignore this email.`
    ),

    NOTIFICATION_ALERT: defineTemplate<[title: string, message: string]>(
        `
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0c1018;color:#e2e8f0;border-radius:12px">
                        <h2 style="margin:0 0 12px;font-size:18px;color:#ffffff">{0}</h2>
                        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">{1}</p>
                        <hr style="border:none;border-top:1px solid #1e293b;margin:16px 0" />
                        <p style="margin:0;font-size:12px;color:#475569">
                            You're receiving this because you enabled email alerts on SolSight.
                        </p>
                    </div>
`,
        `{0}\n\n{1}\n\n—\nYou're receiving this because you enabled email alerts on SolSight.`
    ),

    WALLET_ALERT: defineTemplate<[title: string, bodyHtml: string, bodyText: string]>(
        `
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0c1018;color:#e2e8f0;border-radius:12px">
                        <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#ffffff">{0}</h2>
                        {1}
                        <hr style="border:none;border-top:1px solid #1e293b;margin:16px 0" />
                        <p style="margin:0;font-size:12px;color:#475569">
                            You're receiving this because you enabled wallet alerts on SolSight.
                        </p>
                    </div>
`,
        `{0}\n\n{2}\n\n—\nYou're receiving this because you enabled wallet alerts on SolSight.`
    )
} as const;
