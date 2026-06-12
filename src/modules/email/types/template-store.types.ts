export type TemplateArg = string | number | boolean | null;

export interface BuiltTemplate<T extends TemplateArg[]> {
    args: T;
    renderHtml: () => string;
    renderText: () => string;
}
