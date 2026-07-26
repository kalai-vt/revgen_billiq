import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as productsApi from '@/features/products/api';
import { CANONICAL_FIELDS, CANONICAL_FIELD_LABELS } from '@/features/products/api';
import type { ColumnMapping, ImportRowListResult } from '@/features/products/api';
import { ApiError } from '@/lib/api-client';

interface ImportMappingStepProps {
  importId: string;
  detectedHeaders: string[];
  initialMapping: ColumnMapping;
  onMapped: (result: ImportRowListResult) => void;
}

const NOT_MAPPED = '__not_mapped__';

export function ImportMappingStep({ importId, detectedHeaders, initialMapping, onMapped }: ImportMappingStepProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(mapping.name) && Boolean(mapping.identifier_value);

  async function handleSubmit() {
    if (!canSubmit) {
      setError('Map a Product Name column and an Identifier column before continuing.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await productsApi.confirmImportMapping(importId, mapping);
      onMapped(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply column mapping');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Map Columns</CardTitle>
        <CardDescription>
          Your file's columns didn't exactly match the template. Match each field below to a column from your file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CANONICAL_FIELDS.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label>
                {CANONICAL_FIELD_LABELS[field]}
                {(field === 'name' || field === 'identifier_value') && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={mapping[field] ?? NOT_MAPPED}
                onValueChange={(value) =>
                  setMapping((prev) => ({ ...prev, [field]: value === NOT_MAPPED ? null : value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string | null) => (!value || value === NOT_MAPPED ? 'Not mapped' : value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_MAPPED}>Not mapped</SelectItem>
                  {detectedHeaders.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">* Required — map Product Name and Identifier.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Validating…' : 'Continue to Preview'}
        </Button>
      </CardContent>
    </Card>
  );
}
