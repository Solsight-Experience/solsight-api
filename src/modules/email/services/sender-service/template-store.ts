import { BuiltTemplate, TemplateArg } from "../../types/template-store.types";

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
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 32px;background:#0c1018;color:#e2e8f0;border-radius:16px;border:1px solid #1e293b">
                        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Verify your email</h2>
                        <p style="margin:0 0 32px;font-size:14px;color:#94a3b8;line-height:1.7">
                            Click the button below to verify your email and activate your SolSight account.
                        </p>
                        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
                            <tr>
                                <td style="border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6)">
                                    <a href="{0}"
                                       style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.2px;white-space:nowrap">
                                        Verify Email
                                    </a>
                                </td>
                            </tr>
                        </table>
                        <p style="margin:28px 0 0;font-size:12px;color:#475569;line-height:1.6">
                            This link expires in <strong style="color:#64748b">24 hours</strong>. If you didn't create a SolSight account, you can safely ignore this email.
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
