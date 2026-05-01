"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
};
type Invite = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  expires_at: string;
  created_at: string;
};

export function MembersTable({
  members,
  invites,
  currentUserId,
  currentUserRole,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin";
  const canManage = isOwner || isAdmin;
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeRole(userId: string, role: "admin" | "member") {
    const res = await fetch(`/api/org/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    toast.success("Role updated");
    router.refresh();
  }

  async function transferOwnership(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/org/members/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer-ownership" }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.error) return toast.error(json.error.message);
    toast.success("Ownership transferred");
    setTransferTarget(null);
    router.refresh();
  }

  async function removeMember(userId: string) {
    setBusy(true);
    const res = await fetch(`/api/org/members/${userId}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (json.error) return toast.error(json.error.message);
    toast.success("Member removed");
    setRemoveTarget(null);
    router.refresh();
  }

  async function cancelInvite(inviteId: string) {
    const res = await fetch(`/api/org/invitations?id=${inviteId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.error) return toast.error(json.error.message);
    toast.success("Invite cancelled");
    router.refresh();
  }

  async function resendInvite(invite: Invite) {
    const res = await fetch("/api/org/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invite.email, role: invite.role }),
    });
    const json = await res.json();
    if (json.error && json.error.code !== "email_failed") return toast.error(json.error.message);
    toast.success("Invite resent");
    router.refresh();
  }

  function canRemove(member: Member): boolean {
    if (member.id === currentUserId) return false;
    if (isOwner) return true;
    if (isAdmin) return member.role === "member";
    return false;
  }

  return (
    <div className="space-y-8">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const showMenu = canManage && m.id !== currentUserId;
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.full_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium uppercase">
                    {m.role}
                  </span>
                </TableCell>
                <TableCell>
                  {showMenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          •••
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isOwner && m.role !== "owner" ? (
                          <>
                            <DropdownMenuLabel>Role</DropdownMenuLabel>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => changeRole(m.id, "admin")}>
                                  Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => changeRole(m.id, "member")}>
                                  Member
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => setTransferTarget(m)}>
                              Transfer ownership
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        {canRemove(m) ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoveTarget(m)}
                          >
                            Remove from organization
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {invites.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Pending invites</h3>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.email}</TableCell>
                  <TableCell className="capitalize">{i.role}</TableCell>
                  <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(i.expires_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            •••
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => resendInvite(i)}>Resend</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => cancelInvite(i.id)}
                          >
                            Cancel invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {transferTarget?.full_name ?? transferTarget?.email} will become the new owner. You
              will become an admin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => transferTarget && transferOwnership(transferTarget.id)}
              disabled={busy}
            >
              {busy ? "Transferring..." : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {removeTarget?.full_name ?? removeTarget?.email} will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMember(removeTarget.id)}
              disabled={busy}
            >
              {busy ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
