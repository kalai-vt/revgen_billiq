import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as commerceApi from '@/features/commerce/api';
import { ProductMapPicker } from '@/features/commerce/components/ProductMapPicker';

export function ProductMappingPage() {
  const { data: unmapped, isLoading: unmappedLoading } = useQuery({
    queryKey: ['commerce-unmapped-skus'],
    queryFn: () => commerceApi.listUnmappedSkus(),
  });
  const { data: mappings, isLoading: mappingsLoading } = useQuery({
    queryKey: ['commerce-product-mappings'],
    queryFn: () => commerceApi.listProductMappings(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Product Mapping</h1>
        <p className="text-sm text-muted-foreground">Match Swiggy/Zomato menu items to your product catalog so orders can auto-bill.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs Mapping</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unmappedLoading ? (
            <div className="p-4">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Orders affected</TableHead>
                  <TableHead className="w-56">Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmapped?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState icon={PackageSearch} title="Nothing to map" description="Every synced order item resolves to a product." />
                    </TableCell>
                  </TableRow>
                )}
                {unmapped?.map((u) => (
                  <TableRow key={`${u.platform}-${u.platform_sku}`}>
                    <TableCell className="capitalize">{u.platform}</TableCell>
                    <TableCell>{u.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.platform_sku}</TableCell>
                    <TableCell className="text-right">{u.order_count}</TableCell>
                    <TableCell>
                      <ProductMapPicker platform={u.platform} platformSku={u.platform_sku} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing Mappings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mappingsLoading ? (
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No mappings yet.
                    </TableCell>
                  </TableRow>
                )}
                {mappings?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="capitalize">{m.platform}</TableCell>
                    <TableCell className="text-muted-foreground">{m.platform_sku}</TableCell>
                    <TableCell>{m.product_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
