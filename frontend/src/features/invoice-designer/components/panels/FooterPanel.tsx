import { Checkbox } from '@/components/ui/checkbox';
import { FOOTER_SECTION_LABELS } from '@/features/invoice-designer/api';
import type { FooterSection } from '@/features/invoice-designer/api';
import { DraggableList } from '@/features/invoice-designer/components/DraggableList';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import { cn } from '@/lib/utils';

export function FooterPanel({ config, onChange }: PanelProps) {
  const sections = [...config.footer.sections].sort((a, b) => a.order - b.order);

  function updateSection(key: string, patch: Partial<FooterSection>) {
    onChange((cfg) => ({
      ...cfg,
      footer: { sections: cfg.footer.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) },
    }));
  }

  function reorder(newSections: FooterSection[]) {
    onChange((cfg) => ({
      ...cfg,
      footer: { sections: newSections.map((s, index) => ({ ...s, order: index })) },
    }));
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Drag to reorder. Enable a section and edit the text that will print on the invoice.
      </p>
      <DraggableList
        items={sections.map((s) => ({ ...s, key: s.key }))}
        onReorder={reorder}
        renderItem={(section) => (
          <div className="w-full space-y-1.5">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={section.enabled}
                onCheckedChange={(v) => updateSection(section.key, { enabled: v === true })}
                aria-label={`Enable ${FOOTER_SECTION_LABELS[section.key]}`}
              />
              <span className="text-sm font-medium">{FOOTER_SECTION_LABELS[section.key]}</span>
            </div>
            {section.enabled && (
              <textarea
                value={section.text}
                onChange={(e) => updateSection(section.key, { text: e.target.value })}
                rows={2}
                className={cn(
                  'w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none',
                  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                )}
                placeholder={`Enter ${FOOTER_SECTION_LABELS[section.key].toLowerCase()} text…`}
              />
            )}
          </div>
        )}
      />
    </div>
  );
}
