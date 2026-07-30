import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  VISIBLE_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type InvoiceTemplate,
} from '@/features/invoice-designer/api';

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

const AUTOSAVE_LABEL: Record<AutosaveStatus, string> = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Could not save',
};

interface TemplateToolbarProps {
  documentType: DocumentType;
  onDocumentTypeChange: (type: DocumentType) => void;
  templates: InvoiceTemplate[] | undefined;
  selected: InvoiceTemplate | null;
  selectedId: string | null;
  onSelectTemplate: (id: string | null) => void;
  draftName: string;
  onDraftNameChange: (name: string) => void;
  autosaveStatus: AutosaveStatus;
  onSaveNow: () => void;
  isSaving: boolean;
  canSave: boolean;
  onCreate: () => void;
  isCreating: boolean;
  onDuplicate: () => void;
  isDuplicating: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  onSetDefault: () => void;
  isSettingDefault: boolean;
}

/** The document-type/template picker + template actions, consolidated into one horizontal bar
 * (replacing the old fixed-width vertical template list) so the config/preview panels get the
 * space back. Lives outside the grid's independently-scrolling columns, so — like the page
 * title above it — it's never scrolled out of view without needing explicit `position: sticky`. */
export function TemplateToolbar({
  documentType,
  onDocumentTypeChange,
  templates,
  selected,
  selectedId,
  onSelectTemplate,
  draftName,
  onDraftNameChange,
  autosaveStatus,
  onSaveNow,
  isSaving,
  canSave,
  onCreate,
  isCreating,
  onDuplicate,
  isDuplicating,
  onDelete,
  isDeleting,
  onSetDefault,
  isSettingDefault,
}: TemplateToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
      <Select value={documentType} onValueChange={(v) => onDocumentTypeChange(v as DocumentType)}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {VISIBLE_DOCUMENT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedId ?? ''} onValueChange={onSelectTemplate} disabled={!templates || templates.length === 0}>
        <SelectTrigger className="w-56">
          <SelectValue>
            {() =>
              selected ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{selected.name}</span>
                  {selected.is_default && <Badge variant="secondary" className="shrink-0">Default</Badge>}
                </span>
              ) : (
                'No template'
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {templates?.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              <span className="flex items-center gap-1.5">
                {template.name}
                {template.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                {template.is_builtin && <Badge variant="outline" className="text-[10px]">Built-in</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={draftName}
        onChange={(e) => onDraftNameChange(e.target.value)}
        disabled={!selected || selected.is_builtin}
        placeholder="Template name"
        className="w-40"
      />

      <Button size="sm" variant="outline" onClick={onCreate} disabled={isCreating}>
        + New template
      </Button>
      {selected && !selected.is_default && (
        <Button size="sm" variant="outline" onClick={onSetDefault} disabled={isSettingDefault}>
          Set as default
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onDuplicate} disabled={!selected || isDuplicating}>
        Duplicate
      </Button>
      {selected && !selected.is_builtin && (
        <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
          Delete
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {selected?.is_builtin ? (
          <p className="text-xs text-muted-foreground">Built-in template — duplicate it to customize.</p>
        ) : (
          <>
            <p
              className={
                autosaveStatus === 'error'
                  ? 'text-xs text-destructive'
                  : 'flex items-center gap-1 text-xs text-muted-foreground'
              }
            >
              {autosaveStatus === 'saving' && <Loader2 className="size-3 animate-spin" />}
              {AUTOSAVE_LABEL[autosaveStatus]}
            </p>
            <Button size="sm" onClick={onSaveNow} disabled={!canSave || isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
