import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { RenderingException } from '@iep/common';

export interface RenderResult {
    subject: string;
    html: string;
    text?: string;
}

@Injectable()
export class RenderingService {
    private readonly logger = new Logger(RenderingService.name);
    private readonly templateCache = new Map<string, HandlebarsTemplateDelegate>();

    /**
     * Renders subject, HTML body, and optional text body with Handlebars variables.
     * If no variables are provided, content is returned as-is.
     */
    render(
        content: { subject: string; htmlBody: string; textBody?: string },
        variables?: Record<string, unknown>,
    ): RenderResult {
        // No variables → passthrough (no rendering needed)
        if (!variables || Object.keys(variables).length === 0) {
            return {
                subject: content.subject,
                html: content.htmlBody,
                text: content.textBody,
            };
        }

        try {
            const subject = this.compileAndRender(content.subject, variables, 'subject');
            const html = this.compileAndRender(content.htmlBody, variables, 'htmlBody');
            const text = content.textBody
                ? this.compileAndRender(content.textBody, variables, 'textBody')
                : undefined;

            return { subject, html, text };
        } catch (error) {
            if (error instanceof RenderingException) throw error;
            throw new RenderingException((error as Error).message, 'unknown');
        }
    }

    private compileAndRender(
        template: string,
        variables: Record<string, unknown>,
        field: string,
    ): string {
        try {
            // Use cache for performance
            let compiled = this.templateCache.get(template);
            if (!compiled) {
                compiled = Handlebars.compile(template, { strict: false });
                // Cap cache size at 1000 templates
                if (this.templateCache.size > 1000) {
                    const firstKey = this.templateCache.keys().next().value;
                    if (firstKey) this.templateCache.delete(firstKey);
                }
                this.templateCache.set(template, compiled);
            }
            return compiled(variables);
        } catch (err) {
            this.logger.error(`Rendering failed for field "${field}"`, (err as Error).message);
            throw new RenderingException((err as Error).message, field);
        }
    }
}
