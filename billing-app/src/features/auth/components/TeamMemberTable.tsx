import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as authApi from '@/features/auth/api';

export function TeamMemberTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: authApi.listTeamMembers,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading team…</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden sm:table-cell">Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="hidden sm:table-cell">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.items.map((member) => (
          <TableRow key={member.id}>
            <TableCell className="font-medium">
              {member.first_name} {member.last_name}
            </TableCell>
            <TableCell className="hidden sm:table-cell">{member.email}</TableCell>
            <TableCell className="capitalize">
              <Badge variant="secondary">{member.role}</Badge>
            </TableCell>
            <TableCell className="hidden capitalize sm:table-cell">{member.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
